"""Camera streaming API endpoints for Bambu Lab printers."""

import asyncio
import logging
from typing import AsyncGenerator

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.core.database import get_db
from backend.app.models.printer import Printer
from backend.app.services.camera import (
    build_camera_url,
    capture_camera_frame,
    test_camera_connection,
    get_ffmpeg_path,
    get_camera_port,
)
from backend.app.services.printer_manager import printer_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/printers", tags=["camera"])


async def get_printer_or_404(printer_id: int, db: AsyncSession) -> Printer:
    """Get printer by ID or raise 404."""
    result = await db.execute(select(Printer).where(Printer.id == printer_id))
    printer = result.scalar_one_or_none()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    return printer


async def generate_mjpeg_stream(
    ip_address: str,
    access_code: str,
    model: str | None,
    fps: int = 10,
) -> AsyncGenerator[bytes, None]:
    """Generate MJPEG stream from printer camera using ffmpeg.

    This captures frames continuously and yields them in MJPEG format.
    """
    ffmpeg = get_ffmpeg_path()
    if not ffmpeg:
        logger.error("ffmpeg not found - camera streaming requires ffmpeg")
        yield (
            b"--frame\r\n"
            b"Content-Type: text/plain\r\n\r\n"
            b"Error: ffmpeg not installed\r\n"
        )
        return

    port = get_camera_port(model)
    camera_url = f"rtsps://bblp:{access_code}@{ip_address}:{port}/streaming/live/1"

    # ffmpeg command to output MJPEG stream to stdout
    # -rtsp_transport tcp: Use TCP for reliability
    # -rtsp_flags prefer_tcp: Prefer TCP for RTSP
    # -f mjpeg: Output as MJPEG
    # -q:v 5: Quality (lower = better, 2-10 is good range)
    # -r: Output framerate
    cmd = [
        ffmpeg,
        "-rtsp_transport", "tcp",
        "-rtsp_flags", "prefer_tcp",
        "-i", camera_url,
        "-f", "mjpeg",
        "-q:v", "5",
        "-r", str(fps),
        "-an",  # No audio
        "-"  # Output to stdout
    ]

    logger.info(f"Starting camera stream for {ip_address} using URL: rtsps://bblp:***@{ip_address}:{port}/streaming/live/1")
    logger.debug(f"ffmpeg command: {ffmpeg} ... (url hidden)")

    process = None
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        # Give ffmpeg a moment to start and check for immediate failures
        await asyncio.sleep(0.5)
        if process.returncode is not None:
            stderr = await process.stderr.read()
            logger.error(f"ffmpeg failed immediately: {stderr.decode()}")
            yield (
                b"--frame\r\n"
                b"Content-Type: text/plain\r\n\r\n"
                b"Error: Camera connection failed. Check printer is on and camera is enabled.\r\n"
            )
            return

        # Read JPEG frames from ffmpeg output
        # JPEG images start with 0xFFD8 and end with 0xFFD9
        buffer = b""
        jpeg_start = b"\xff\xd8"
        jpeg_end = b"\xff\xd9"

        while True:
            try:
                # Read chunk from ffmpeg
                chunk = await asyncio.wait_for(
                    process.stdout.read(8192),
                    timeout=10.0
                )

                if not chunk:
                    logger.warning("Camera stream ended (no more data)")
                    break

                buffer += chunk

                # Find complete JPEG frames in buffer
                while True:
                    start_idx = buffer.find(jpeg_start)
                    if start_idx == -1:
                        # No start marker, clear buffer up to last 2 bytes
                        buffer = buffer[-2:] if len(buffer) > 2 else buffer
                        break

                    # Trim anything before the start marker
                    if start_idx > 0:
                        buffer = buffer[start_idx:]

                    end_idx = buffer.find(jpeg_end, 2)  # Skip first 2 bytes
                    if end_idx == -1:
                        # No end marker yet, wait for more data
                        break

                    # Extract complete frame
                    frame = buffer[:end_idx + 2]
                    buffer = buffer[end_idx + 2:]

                    # Yield frame in MJPEG format
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n"
                        b"Content-Length: " + str(len(frame)).encode() + b"\r\n"
                        b"\r\n" + frame + b"\r\n"
                    )

            except asyncio.TimeoutError:
                logger.warning("Camera stream read timeout")
                break
            except asyncio.CancelledError:
                logger.info("Camera stream cancelled")
                break

    except FileNotFoundError:
        logger.error("ffmpeg not found - camera streaming requires ffmpeg")
        yield (
            b"--frame\r\n"
            b"Content-Type: text/plain\r\n\r\n"
            b"Error: ffmpeg not installed\r\n"
        )
    except Exception as e:
        logger.exception(f"Camera stream error: {e}")
    finally:
        if process:
            try:
                process.terminate()
                await asyncio.wait_for(process.wait(), timeout=5.0)
            except Exception:
                process.kill()
                await process.wait()
            logger.info(f"Camera stream stopped for {ip_address}")


@router.get("/{printer_id}/camera/stream")
async def camera_stream(
    printer_id: int,
    fps: int = 10,
    db: AsyncSession = Depends(get_db),
):
    """Stream live video from printer camera as MJPEG.

    This endpoint returns a multipart MJPEG stream that can be used directly
    in an <img> tag or video player.

    Args:
        printer_id: Printer ID
        fps: Target frames per second (default: 10, max: 30)
    """
    printer = await get_printer_or_404(printer_id, db)

    # Validate FPS
    fps = min(max(fps, 1), 30)

    return StreamingResponse(
        generate_mjpeg_stream(
            ip_address=printer.ip_address,
            access_code=printer.access_code,
            model=printer.model,
            fps=fps,
        ),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            "Expires": "0",
        }
    )


@router.get("/{printer_id}/camera/snapshot")
async def camera_snapshot(
    printer_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Capture a single frame from the printer camera.

    Returns a JPEG image.
    """
    import tempfile
    from pathlib import Path

    printer = await get_printer_or_404(printer_id, db)

    # Create temporary file for the snapshot
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        temp_path = Path(f.name)

    try:
        success = await capture_camera_frame(
            ip_address=printer.ip_address,
            access_code=printer.access_code,
            model=printer.model,
            output_path=temp_path,
            timeout=15,
        )

        if not success:
            raise HTTPException(
                status_code=503,
                detail="Failed to capture camera frame. Is the printer powered on?"
            )

        # Read and return the image
        with open(temp_path, "rb") as f:
            image_data = f.read()

        return Response(
            content=image_data,
            media_type="image/jpeg",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Content-Disposition": f'inline; filename="snapshot_{printer_id}.jpg"'
            }
        )
    finally:
        # Clean up temp file
        if temp_path.exists():
            temp_path.unlink()


@router.get("/{printer_id}/camera/test")
async def test_camera(
    printer_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Test camera connection for a printer.

    Returns success status and any error message.
    """
    printer = await get_printer_or_404(printer_id, db)

    result = await test_camera_connection(
        ip_address=printer.ip_address,
        access_code=printer.access_code,
        model=printer.model,
    )

    return result
