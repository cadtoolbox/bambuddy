from datetime import datetime
from pydantic import BaseModel, Field


class PrinterBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    serial_number: str = Field(..., min_length=1, max_length=50)
    ip_address: str = Field(..., pattern=r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$")
    access_code: str = Field(..., min_length=1, max_length=20)
    model: str | None = None
    auto_archive: bool = True


class PrinterCreate(PrinterBase):
    pass


class PrinterUpdate(BaseModel):
    name: str | None = None
    ip_address: str | None = None
    access_code: str | None = None
    model: str | None = None
    is_active: bool | None = None
    auto_archive: bool | None = None
    print_hours_offset: float | None = None


class PrinterResponse(PrinterBase):
    id: int
    is_active: bool
    nozzle_count: int = 1  # 1 or 2, auto-detected from MQTT
    print_hours_offset: float = 0.0
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class HMSErrorResponse(BaseModel):
    code: str
    module: int
    severity: int  # 1=fatal, 2=serious, 3=common, 4=info


class AMSTray(BaseModel):
    id: int
    tray_color: str | None = None
    tray_type: str | None = None
    remain: int = 0
    k: float | None = None  # Pressure advance value


class AMSUnit(BaseModel):
    id: int
    humidity: int | None = None
    temp: float | None = None
    tray: list[AMSTray] = []


class NozzleInfoResponse(BaseModel):
    nozzle_type: str = ""  # "stainless_steel" or "hardened_steel"
    nozzle_diameter: str = ""  # e.g., "0.4"


class PrinterStatus(BaseModel):
    id: int
    name: str
    connected: bool
    state: str | None = None
    current_print: str | None = None
    subtask_name: str | None = None
    gcode_file: str | None = None
    progress: float | None = None
    remaining_time: int | None = None
    layer_num: int | None = None
    total_layers: int | None = None
    temperatures: dict | None = None
    cover_url: str | None = None
    hms_errors: list[HMSErrorResponse] = []
    ams: list[AMSUnit] = []
    ams_exists: bool = False
    vt_tray: AMSTray | None = None  # Virtual tray / external spool
    sdcard: bool = False  # SD card inserted
    timelapse: bool = False  # Timelapse recording active
    ipcam: bool = False  # Live view enabled
    nozzles: list[NozzleInfoResponse] = []  # Nozzle hardware info (index 0=left/primary, 1=right)
