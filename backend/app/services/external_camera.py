"""External network camera service.

Supports MJPEG streams, RTSP streams (via ffmpeg), and HTTP snapshot URLs.
"""

import asyncio
import logging
import shutil
from collections.abc import AsyncGenerator
from pathlib import Path

import aiohttp

logger = logging.getLogger(__name__)


def get_ffmpeg_path() -> str | None:
    """Get the path to ffmpeg executable."""
    # Try shutil.which first
    path = shutil.which("ffmpeg")
    if path:
        return path
    # Check common locations (systemd services may have limited PATH)
    for common_path in ["/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg", "/opt/homebrew/bin/ffmpeg"]:
        if Path(common_path).exists():
            return common_path
    return None


async def capture_frame(url: str, camera_type: str, timeout: int = 15) -> bytes | None:
    """Capture single frame from external camera.

    Args:
        url: Camera URL (MJPEG stream, RTSP URL, or HTTP snapshot URL)
        camera_type: "mjpeg", "rtsp", or "snapshot"
        timeout: Connection timeout in seconds

    Returns:
        JPEG bytes or None on failure
    """
    logger.debug(f"capture_frame called: type={camera_type}, url={url[:50] if url else 'None'}...")
    if camera_type == "mjpeg":
        return await _capture_mjpeg_frame(url, timeout)
    elif camera_type == "rtsp":
        return await _capture_rtsp_frame(url, timeout)
    elif camera_type == "snapshot":
        return await _capture_snapshot(url, timeout)
    else:
        logger.warning(f"Unknown camera type: {camera_type}")
        return None


async def _capture_mjpeg_frame(url: str, timeout: int) -> bytes | None:
    """Extract single frame from MJPEG stream."""
    try:
        async with (
            aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session,
            session.get(url) as response,
        ):
            if response.status != 200:
                logger.error(f"MJPEG stream returned status {response.status}")
                return None

            # Read chunks until we find a complete JPEG frame
            buffer = b""
            jpeg_start = b"\xff\xd8"
            jpeg_end = b"\xff\xd9"

            async for chunk in response.content.iter_chunked(8192):
                buffer += chunk

                # Look for complete JPEG frame
                start_idx = buffer.find(jpeg_start)
                if start_idx == -1:
                    continue

                end_idx = buffer.find(jpeg_end, start_idx + 2)
                if end_idx != -1:
                    # Found complete frame
                    frame = buffer[start_idx : end_idx + 2]
                    return frame

                # Keep searching, but limit buffer size
                if len(buffer) > 5 * 1024 * 1024:  # 5MB limit
                    logger.warning("MJPEG buffer exceeded 5MB without finding frame")
                    return None

    except TimeoutError:
        logger.warning(f"MJPEG frame capture timed out after {timeout}s")
        return None
    except Exception as e:
        logger.error(f"MJPEG frame capture failed: {e}")
        return None

    return None


async def _capture_rtsp_frame(url: str, timeout: int) -> bytes | None:
    """Capture frame from RTSP using ffmpeg."""
    ffmpeg = get_ffmpeg_path()
    if not ffmpeg:
        logger.error("ffmpeg not found - required for RTSP capture")
        return None

    # Use ffmpeg to grab a single frame from RTSP stream
    # ffmpeg handles both rtsp:// and rtsps:// URLs automatically
    cmd = [
        ffmpeg,
        "-rtsp_transport",
        "tcp",
        "-i",
        url,
        "-frames:v",
        "1",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-q:v",
        "2",
        "-",
    ]

    try:
        print(f"[EXT-CAM] Running ffmpeg command: {' '.join(cmd[:6])}...")
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
        print(
            f"[EXT-CAM] ffmpeg returned: code={process.returncode}, stdout={len(stdout)} bytes, stderr={len(stderr)} bytes"
        )

        if process.returncode != 0:
            logger.error(f"ffmpeg RTSP capture failed: {stderr.decode()[:200]}")
            print(f"[EXT-CAM] ffmpeg error: {stderr.decode()[:300]}")
            return None

        if not stdout or len(stdout) < 100:
            logger.error("ffmpeg returned empty or too small frame")
            return None

        return stdout

    except TimeoutError:
        logger.warning(f"RTSP frame capture timed out after {timeout}s")
        if process:
            process.kill()
        return None
    except Exception as e:
        logger.error(f"RTSP frame capture failed: {e}")
        return None


async def _capture_snapshot(url: str, timeout: int) -> bytes | None:
    """Fetch snapshot from HTTP URL."""
    try:
        async with (
            aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=timeout)) as session,
            session.get(url) as response,
        ):
            if response.status != 200:
                logger.error(f"Snapshot URL returned status {response.status}")
                return None

            data = await response.read()

            # Validate it looks like JPEG
            if not data.startswith(b"\xff\xd8"):
                logger.warning("Snapshot does not appear to be JPEG")
                # Still return it - might be valid with different header

            return data

    except TimeoutError:
        logger.warning(f"Snapshot capture timed out after {timeout}s")
        return None
    except Exception as e:
        logger.error(f"Snapshot capture failed: {e}")
        return None


async def test_connection(url: str, camera_type: str) -> dict:
    """Test camera connection.

    Returns:
        Dict with {success: bool, error?: str, resolution?: str}
    """
    print(f"[EXT-CAM] Testing camera connection: type={camera_type}, url={url[:50]}...")
    logger.info(f"Testing camera connection: type={camera_type}, url={url[:50]}...")
    try:
        frame = await capture_frame(url, camera_type, timeout=10)
        print(f"[EXT-CAM] Capture result: {len(frame) if frame else 0} bytes")
        logger.info(f"Capture result: {len(frame) if frame else 0} bytes")

        if frame:
            # Try to get resolution from JPEG header
            resolution = None
            try:
                # Simple JPEG dimension extraction
                # SOF0 marker is FF C0, followed by length, precision, height, width
                sof_markers = [b"\xff\xc0", b"\xff\xc1", b"\xff\xc2"]
                for marker in sof_markers:
                    idx = frame.find(marker)
                    if idx != -1 and idx + 9 <= len(frame):
                        height = (frame[idx + 5] << 8) | frame[idx + 6]
                        width = (frame[idx + 7] << 8) | frame[idx + 8]
                        resolution = f"{width}x{height}"
                        break
            except Exception:
                pass

            return {"success": True, "resolution": resolution}
        else:
            return {"success": False, "error": "Failed to capture frame from camera"}

    except Exception as e:
        return {"success": False, "error": str(e)}


async def generate_mjpeg_stream(url: str, camera_type: str, fps: int = 10) -> AsyncGenerator[bytes, None]:
    """Generator yielding MJPEG frames for streaming.

    Args:
        url: Camera URL
        camera_type: "mjpeg", "rtsp", or "snapshot"
        fps: Target frames per second

    Yields:
        MJPEG frame data with HTTP multipart boundaries
    """
    frame_interval = 1.0 / max(fps, 1)
    last_frame_time = 0.0

    if camera_type == "mjpeg":
        # Proxy MJPEG stream directly
        async for frame in _stream_mjpeg(url):
            current_time = asyncio.get_event_loop().time()
            if current_time - last_frame_time >= frame_interval:
                last_frame_time = current_time
                yield _format_mjpeg_frame(frame)

    elif camera_type == "rtsp":
        # Use ffmpeg to convert RTSP to MJPEG
        async for frame in _stream_rtsp(url, fps):
            yield _format_mjpeg_frame(frame)

    elif camera_type == "snapshot":
        # Poll snapshot URL at interval
        while True:
            try:
                frame = await _capture_snapshot(url, timeout=10)
                if frame:
                    yield _format_mjpeg_frame(frame)
                await asyncio.sleep(frame_interval)
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.warning(f"Snapshot poll failed: {e}")
                await asyncio.sleep(frame_interval)


def _format_mjpeg_frame(frame: bytes) -> bytes:
    """Format frame for MJPEG HTTP response."""
    return (
        b"--frame\r\n"
        b"Content-Type: image/jpeg\r\n"
        b"Content-Length: " + str(len(frame)).encode() + b"\r\n"
        b"\r\n" + frame + b"\r\n"
    )


async def _stream_mjpeg(url: str) -> AsyncGenerator[bytes, None]:
    """Stream frames from MJPEG URL."""
    try:
        timeout = aiohttp.ClientTimeout(total=None, sock_read=30)
        async with aiohttp.ClientSession(timeout=timeout) as session, session.get(url) as response:
            if response.status != 200:
                logger.error(f"MJPEG stream returned status {response.status}")
                return

            buffer = b""
            jpeg_start = b"\xff\xd8"
            jpeg_end = b"\xff\xd9"

            async for chunk in response.content.iter_chunked(8192):
                buffer += chunk

                # Extract complete frames from buffer
                while True:
                    start_idx = buffer.find(jpeg_start)
                    if start_idx == -1:
                        buffer = buffer[-2:] if len(buffer) > 2 else buffer
                        break

                    if start_idx > 0:
                        buffer = buffer[start_idx:]

                    end_idx = buffer.find(jpeg_end, 2)
                    if end_idx == -1:
                        break

                    frame = buffer[: end_idx + 2]
                    buffer = buffer[end_idx + 2 :]
                    yield frame

    except asyncio.CancelledError:
        logger.info("MJPEG stream cancelled")
    except Exception as e:
        logger.error(f"MJPEG stream error: {e}")


async def _stream_rtsp(url: str, fps: int) -> AsyncGenerator[bytes, None]:
    """Stream frames from RTSP URL via ffmpeg."""
    ffmpeg = get_ffmpeg_path()
    if not ffmpeg:
        logger.error("ffmpeg not found - required for RTSP streaming")
        return

    # ffmpeg handles both rtsp:// and rtsps:// URLs automatically
    cmd = [
        ffmpeg,
        "-rtsp_transport",
        "tcp",
        "-rtsp_flags",
        "prefer_tcp",
        "-timeout",
        "30000000",
        "-buffer_size",
        "1024000",
        "-max_delay",
        "500000",
        "-i",
        url,
        "-f",
        "mjpeg",
        "-q:v",
        "5",
        "-r",
        str(fps),
        "-an",
        "-",
    ]

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
            logger.error(f"ffmpeg RTSP stream failed immediately: {stderr.decode()[:300]}")
            return

        buffer = b""
        jpeg_start = b"\xff\xd8"
        jpeg_end = b"\xff\xd9"

        while True:
            try:
                chunk = await asyncio.wait_for(process.stdout.read(8192), timeout=30.0)

                if not chunk:
                    break

                buffer += chunk

                # Extract complete frames
                while True:
                    start_idx = buffer.find(jpeg_start)
                    if start_idx == -1:
                        buffer = buffer[-2:] if len(buffer) > 2 else buffer
                        break

                    if start_idx > 0:
                        buffer = buffer[start_idx:]

                    end_idx = buffer.find(jpeg_end, 2)
                    if end_idx == -1:
                        break

                    frame = buffer[: end_idx + 2]
                    buffer = buffer[end_idx + 2 :]
                    yield frame

            except TimeoutError:
                logger.warning("RTSP stream read timeout")
                break

    except asyncio.CancelledError:
        logger.info("RTSP stream cancelled")
    except Exception as e:
        logger.error(f"RTSP stream error: {e}")
    finally:
        if process and process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=2.0)
            except TimeoutError:
                process.kill()
                await process.wait()
