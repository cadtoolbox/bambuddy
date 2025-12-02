"""Printer control API endpoints for full printer control."""

import logging
import secrets
import time
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from backend.app.core.database import get_db
from backend.app.models.printer import Printer
from backend.app.services.printer_manager import printer_manager

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/printers", tags=["printer-control"])

# Store confirmation tokens with expiry: {token: (printer_id, action, expiry_time)}
_confirmation_tokens: dict[str, tuple[int, str, float]] = {}
CONFIRMATION_TOKEN_EXPIRY = 60  # seconds


def _clean_expired_tokens():
    """Remove expired confirmation tokens."""
    now = time.time()
    expired = [t for t, (_, _, exp) in _confirmation_tokens.items() if now > exp]
    for token in expired:
        _confirmation_tokens.pop(token, None)


def _create_confirmation_token(printer_id: int, action: str) -> str:
    """Create a confirmation token for dangerous operations."""
    _clean_expired_tokens()
    token = secrets.token_urlsafe(16)
    _confirmation_tokens[token] = (printer_id, action, time.time() + CONFIRMATION_TOKEN_EXPIRY)
    return token


def _validate_confirmation_token(token: str, printer_id: int, action: str) -> bool:
    """Validate and consume a confirmation token."""
    _clean_expired_tokens()
    if token not in _confirmation_tokens:
        return False
    stored_printer_id, stored_action, expiry = _confirmation_tokens[token]
    if stored_printer_id != printer_id or stored_action != action:
        return False
    if time.time() > expiry:
        _confirmation_tokens.pop(token, None)
        return False
    # Consume the token
    _confirmation_tokens.pop(token, None)
    return True


async def get_printer_or_404(printer_id: int, db: AsyncSession) -> Printer:
    """Get printer by ID or raise 404."""
    result = await db.execute(select(Printer).where(Printer.id == printer_id))
    printer = result.scalar_one_or_none()
    if not printer:
        raise HTTPException(status_code=404, detail="Printer not found")
    return printer


def get_mqtt_client_or_503(printer_id: int):
    """Get MQTT client for printer or raise 503."""
    client = printer_manager.get_client(printer_id)
    if not client:
        raise HTTPException(status_code=503, detail="Printer not connected")
    if not client.state.connected:
        raise HTTPException(status_code=503, detail="Printer connection lost")
    return client


# =============================================================================
# Request/Response Models
# =============================================================================

class ControlResponse(BaseModel):
    success: bool
    message: str


class ConfirmationRequired(BaseModel):
    requires_confirmation: bool = True
    token: str
    warning: str
    expires_in: int = CONFIRMATION_TOKEN_EXPIRY


class ConfirmableRequest(BaseModel):
    confirm_token: Optional[str] = None


class TemperatureRequest(ConfirmableRequest):
    target: int = Field(..., ge=0, le=350, description="Target temperature in Celsius")


class NozzleTemperatureRequest(TemperatureRequest):
    nozzle: int = Field(default=0, ge=0, le=1, description="Nozzle index (0 or 1 for dual nozzle)")


class SpeedRequest(BaseModel):
    mode: int = Field(..., ge=1, le=4, description="Speed mode: 1=silent, 2=standard, 3=sport, 4=ludicrous")


class FanRequest(BaseModel):
    speed: int = Field(..., ge=0, le=100, description="Fan speed percentage (0-100)")


class LightRequest(BaseModel):
    on: bool = Field(..., description="Light state: true=on, false=off")


class CameraSettingRequest(BaseModel):
    enable: bool = Field(..., description="Enable or disable the setting")


class HomeRequest(ConfirmableRequest):
    axes: str = Field(default="XYZ", description="Axes to home (e.g., 'XYZ', 'X', 'XY', 'Z')")


class MoveRequest(ConfirmableRequest):
    axis: str = Field(..., pattern="^[XYZxyz]$", description="Axis to move: X, Y, or Z")
    distance: float = Field(..., ge=-100, le=100, description="Distance in mm (positive or negative)")
    speed: int = Field(default=3000, ge=100, le=10000, description="Movement speed in mm/min")


class AMSLoadRequest(BaseModel):
    tray_id: int = Field(..., ge=0, le=254, description="Tray ID (0-15 for AMS, 254 for external)")


class GcodeRequest(ConfirmableRequest):
    command: str = Field(..., min_length=1, max_length=500, description="G-code command(s)")


# =============================================================================
# Print Control Endpoints
# =============================================================================

@router.post("/{printer_id}/control/pause", response_model=ControlResponse)
async def pause_print(
    printer_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Pause the current print job."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    # Check if printer is actually printing
    if client.state.state != "RUNNING":
        raise HTTPException(status_code=400, detail="Printer is not currently printing")

    success = client.pause_print()
    return ControlResponse(
        success=success,
        message="Pause command sent" if success else "Failed to send pause command"
    )


@router.post("/{printer_id}/control/resume", response_model=ControlResponse)
async def resume_print(
    printer_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Resume a paused print job."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    # Check if printer is actually paused
    if client.state.state != "PAUSE":
        raise HTTPException(status_code=400, detail="Printer is not paused")

    success = client.resume_print()
    return ControlResponse(
        success=success,
        message="Resume command sent" if success else "Failed to send resume command"
    )


@router.post("/{printer_id}/control/stop")
async def stop_print(
    printer_id: int,
    request: ConfirmableRequest = None,
    db: AsyncSession = Depends(get_db),
):
    """Stop the current print job. Requires confirmation."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    # Check if printer is printing or paused
    if client.state.state not in ("RUNNING", "PAUSE"):
        raise HTTPException(status_code=400, detail="No active print to stop")

    # Require confirmation for stop
    if not request or not request.confirm_token:
        token = _create_confirmation_token(printer_id, "stop")
        return ConfirmationRequired(
            token=token,
            warning="This will abort the current print. The print cannot be resumed. Are you sure?"
        )

    if not _validate_confirmation_token(request.confirm_token, printer_id, "stop"):
        raise HTTPException(status_code=400, detail="Invalid or expired confirmation token")

    success = client.stop_print()
    return ControlResponse(
        success=success,
        message="Stop command sent" if success else "Failed to send stop command"
    )


# =============================================================================
# Temperature Control Endpoints
# =============================================================================

@router.post("/{printer_id}/control/temperature/bed", response_model=ControlResponse)
async def set_bed_temperature(
    printer_id: int,
    request: TemperatureRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set the bed target temperature."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    # Warn for high temperatures
    if request.target > 100 and not request.confirm_token:
        token = _create_confirmation_token(printer_id, "bed_temp")
        return ConfirmationRequired(
            token=token,
            warning=f"Setting bed to {request.target}°C is unusually high. Confirm?"
        )

    if request.target > 100:
        if not _validate_confirmation_token(request.confirm_token, printer_id, "bed_temp"):
            raise HTTPException(status_code=400, detail="Invalid or expired confirmation token")

    success = client.set_bed_temperature(request.target)
    return ControlResponse(
        success=success,
        message=f"Bed temperature set to {request.target}°C" if success else "Failed to set bed temperature"
    )


@router.post("/{printer_id}/control/temperature/nozzle", response_model=ControlResponse)
async def set_nozzle_temperature(
    printer_id: int,
    request: NozzleTemperatureRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set the nozzle target temperature."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    # Warn for high temperatures
    if request.target > 280 and not request.confirm_token:
        token = _create_confirmation_token(printer_id, "nozzle_temp")
        return ConfirmationRequired(
            token=token,
            warning=f"Setting nozzle to {request.target}°C is very high. Confirm?"
        )

    if request.target > 280:
        if not _validate_confirmation_token(request.confirm_token, printer_id, "nozzle_temp"):
            raise HTTPException(status_code=400, detail="Invalid or expired confirmation token")

    success = client.set_nozzle_temperature(request.target, request.nozzle)
    return ControlResponse(
        success=success,
        message=f"Nozzle {request.nozzle} temperature set to {request.target}°C" if success else "Failed to set nozzle temperature"
    )


# =============================================================================
# Speed Control Endpoint
# =============================================================================

@router.post("/{printer_id}/control/speed", response_model=ControlResponse)
async def set_print_speed(
    printer_id: int,
    request: SpeedRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set the print speed mode."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    speed_names = {1: "Silent", 2: "Standard", 3: "Sport", 4: "Ludicrous"}
    success = client.set_print_speed(request.mode)
    return ControlResponse(
        success=success,
        message=f"Speed set to {speed_names[request.mode]}" if success else "Failed to set speed"
    )


# =============================================================================
# Fan Control Endpoints
# =============================================================================

@router.post("/{printer_id}/control/fan/part", response_model=ControlResponse)
async def set_part_fan(
    printer_id: int,
    request: FanRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set part cooling fan speed (0-100%)."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    # Convert percentage to 0-255
    speed_255 = int(request.speed * 255 / 100)
    success = client.set_part_fan(speed_255)
    return ControlResponse(
        success=success,
        message=f"Part fan set to {request.speed}%" if success else "Failed to set part fan"
    )


@router.post("/{printer_id}/control/fan/aux", response_model=ControlResponse)
async def set_aux_fan(
    printer_id: int,
    request: FanRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set auxiliary fan speed (0-100%)."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    speed_255 = int(request.speed * 255 / 100)
    success = client.set_aux_fan(speed_255)
    return ControlResponse(
        success=success,
        message=f"Aux fan set to {request.speed}%" if success else "Failed to set aux fan"
    )


@router.post("/{printer_id}/control/fan/chamber", response_model=ControlResponse)
async def set_chamber_fan(
    printer_id: int,
    request: FanRequest,
    db: AsyncSession = Depends(get_db),
):
    """Set chamber fan speed (0-100%)."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    speed_255 = int(request.speed * 255 / 100)
    success = client.set_chamber_fan(speed_255)
    return ControlResponse(
        success=success,
        message=f"Chamber fan set to {request.speed}%" if success else "Failed to set chamber fan"
    )


# =============================================================================
# Light Control Endpoint
# =============================================================================

@router.post("/{printer_id}/control/light", response_model=ControlResponse)
async def set_chamber_light(
    printer_id: int,
    request: LightRequest,
    db: AsyncSession = Depends(get_db),
):
    """Turn chamber light on or off."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    success = client.set_chamber_light(request.on)
    return ControlResponse(
        success=success,
        message=f"Light turned {'on' if request.on else 'off'}" if success else "Failed to control light"
    )


# =============================================================================
# Movement Control Endpoints
# =============================================================================

@router.post("/{printer_id}/control/home")
async def home_axes(
    printer_id: int,
    request: HomeRequest = None,
    db: AsyncSession = Depends(get_db),
):
    """Home the specified axes."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    axes = (request.axes if request else "XYZ").upper()

    # Warn if homing during print
    if client.state.state in ("RUNNING", "PAUSE"):
        if not request or not request.confirm_token:
            token = _create_confirmation_token(printer_id, "home")
            return ConfirmationRequired(
                token=token,
                warning="Homing during an active print is not recommended. This may damage your print. Continue?"
            )
        if not _validate_confirmation_token(request.confirm_token, printer_id, "home"):
            raise HTTPException(status_code=400, detail="Invalid or expired confirmation token")

    success = client.home_axes(axes)
    return ControlResponse(
        success=success,
        message=f"Homing {axes}" if success else "Failed to send home command"
    )


@router.post("/{printer_id}/control/move")
async def move_axis(
    printer_id: int,
    request: MoveRequest,
    db: AsyncSession = Depends(get_db),
):
    """Move an axis by a relative distance."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    # Block movement during print unless confirmed
    if client.state.state in ("RUNNING", "PAUSE"):
        if not request.confirm_token:
            token = _create_confirmation_token(printer_id, "move")
            return ConfirmationRequired(
                token=token,
                warning="Manual movement during printing can damage your print. Are you sure?"
            )
        if not _validate_confirmation_token(request.confirm_token, printer_id, "move"):
            raise HTTPException(status_code=400, detail="Invalid or expired confirmation token")

    success = client.move_axis(request.axis.upper(), request.distance, request.speed)
    direction = "+" if request.distance > 0 else ""
    return ControlResponse(
        success=success,
        message=f"Moving {request.axis.upper()} {direction}{request.distance}mm" if success else "Failed to send move command"
    )


@router.post("/{printer_id}/control/motors/disable")
async def disable_motors(
    printer_id: int,
    request: ConfirmableRequest = None,
    db: AsyncSession = Depends(get_db),
):
    """Disable stepper motors. Warning: This will lose position."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    # Always require confirmation
    if not request or not request.confirm_token:
        token = _create_confirmation_token(printer_id, "disable_motors")
        return ConfirmationRequired(
            token=token,
            warning="Disabling motors will cause the printer to lose its position. You must home before printing. Continue?"
        )

    if not _validate_confirmation_token(request.confirm_token, printer_id, "disable_motors"):
        raise HTTPException(status_code=400, detail="Invalid or expired confirmation token")

    success = client.disable_motors()
    return ControlResponse(
        success=success,
        message="Motors disabled" if success else "Failed to disable motors"
    )


@router.post("/{printer_id}/control/motors/enable", response_model=ControlResponse)
async def enable_motors(
    printer_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Enable stepper motors."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    success = client.enable_motors()
    return ControlResponse(
        success=success,
        message="Motors enabled" if success else "Failed to enable motors"
    )


# =============================================================================
# AMS Control Endpoints
# =============================================================================

@router.post("/{printer_id}/control/ams/load", response_model=ControlResponse)
async def ams_load_filament(
    printer_id: int,
    request: AMSLoadRequest,
    db: AsyncSession = Depends(get_db),
):
    """Load filament from a specific AMS tray."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    # Don't allow during print
    if client.state.state == "RUNNING":
        raise HTTPException(status_code=400, detail="Cannot change filament during print")

    success = client.ams_load_filament(request.tray_id)
    return ControlResponse(
        success=success,
        message=f"Loading filament from tray {request.tray_id}" if success else "Failed to load filament"
    )


@router.post("/{printer_id}/control/ams/unload", response_model=ControlResponse)
async def ams_unload_filament(
    printer_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Unload the currently loaded filament."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    # Don't allow during print
    if client.state.state == "RUNNING":
        raise HTTPException(status_code=400, detail="Cannot unload filament during print")

    success = client.ams_unload_filament()
    return ControlResponse(
        success=success,
        message="Unloading filament" if success else "Failed to unload filament"
    )


# =============================================================================
# Advanced: G-code Command
# =============================================================================

@router.post("/{printer_id}/control/gcode")
async def send_gcode(
    printer_id: int,
    request: GcodeRequest,
    db: AsyncSession = Depends(get_db),
):
    """Send raw G-code command(s). Advanced users only."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    # Require confirmation for any G-code
    if not request.confirm_token:
        token = _create_confirmation_token(printer_id, "gcode")
        return ConfirmationRequired(
            token=token,
            warning="Sending raw G-code can damage your printer if used incorrectly. Are you sure?"
        )

    if not _validate_confirmation_token(request.confirm_token, printer_id, "gcode"):
        raise HTTPException(status_code=400, detail="Invalid or expired confirmation token")

    success = client.send_gcode(request.command)
    return ControlResponse(
        success=success,
        message="G-code sent" if success else "Failed to send G-code"
    )


# =============================================================================
# Camera Settings Endpoints
# =============================================================================

@router.post("/{printer_id}/control/camera/timelapse", response_model=ControlResponse)
async def set_timelapse(
    printer_id: int,
    request: CameraSettingRequest,
    db: AsyncSession = Depends(get_db),
):
    """Enable or disable timelapse recording."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    success = client.set_timelapse(request.enable)
    return ControlResponse(
        success=success,
        message=f"Timelapse {'enabled' if request.enable else 'disabled'}" if success else "Failed to set timelapse"
    )


@router.post("/{printer_id}/control/camera/liveview", response_model=ControlResponse)
async def set_liveview(
    printer_id: int,
    request: CameraSettingRequest,
    db: AsyncSession = Depends(get_db),
):
    """Enable or disable live view / camera streaming."""
    await get_printer_or_404(printer_id, db)
    client = get_mqtt_client_or_503(printer_id)

    success = client.set_liveview(request.enable)
    return ControlResponse(
        success=success,
        message=f"Live view {'enabled' if request.enable else 'disabled'}" if success else "Failed to set live view"
    )


# =============================================================================
# Status Refresh Endpoint
# =============================================================================

@router.post("/{printer_id}/control/refresh", response_model=ControlResponse)
async def refresh_status(
    printer_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Request a full status update from the printer.

    This sends a 'pushall' command to get the latest data including nozzle info,
    AMS status, and all other printer state.
    """
    await get_printer_or_404(printer_id, db)

    success = printer_manager.request_status_update(printer_id)
    if not success:
        raise HTTPException(status_code=503, detail="Printer not connected")

    return ControlResponse(
        success=success,
        message="Status refresh requested"
    )
