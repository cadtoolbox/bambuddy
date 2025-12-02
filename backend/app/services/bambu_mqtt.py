import json
import ssl
import asyncio
import logging
import time
from collections import deque
from datetime import datetime
from typing import Callable
from dataclasses import dataclass, field

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


@dataclass
class MQTTLogEntry:
    """Log entry for MQTT message debugging."""
    timestamp: str
    topic: str
    direction: str  # "in" or "out"
    payload: dict


@dataclass
class HMSError:
    """Health Management System error from printer."""
    code: str
    module: int
    severity: int  # 1=fatal, 2=serious, 3=common, 4=info
    message: str = ""


@dataclass
class KProfile:
    """Pressure advance (K) calibration profile from printer."""
    slot_id: int
    extruder_id: int
    nozzle_id: str
    nozzle_diameter: str
    filament_id: str
    name: str
    k_value: str
    n_coef: str = "0.000000"
    ams_id: int = 0
    tray_id: int = -1
    setting_id: str | None = None


@dataclass
class NozzleInfo:
    """Nozzle hardware configuration."""
    nozzle_type: str = ""  # "stainless_steel" or "hardened_steel"
    nozzle_diameter: str = ""  # e.g., "0.4"


@dataclass
class PrinterState:
    connected: bool = False
    state: str = "unknown"
    current_print: str | None = None
    subtask_name: str | None = None
    progress: float = 0.0
    remaining_time: int = 0
    layer_num: int = 0
    total_layers: int = 0
    temperatures: dict = field(default_factory=dict)
    raw_data: dict = field(default_factory=dict)
    gcode_file: str | None = None
    subtask_id: str | None = None
    hms_errors: list = field(default_factory=list)  # List of HMSError
    kprofiles: list = field(default_factory=list)  # List of KProfile
    sdcard: bool = False  # SD card inserted
    timelapse: bool = False  # Timelapse recording active
    ipcam: bool = False  # Live view / camera streaming enabled
    # Nozzle hardware info (for dual nozzle printers, index 0 = left, 1 = right)
    nozzles: list = field(default_factory=lambda: [NozzleInfo(), NozzleInfo()])


class BambuMQTTClient:
    """MQTT client for Bambu Lab printer communication."""

    MQTT_PORT = 8883

    def __init__(
        self,
        ip_address: str,
        serial_number: str,
        access_code: str,
        on_state_change: Callable[[PrinterState], None] | None = None,
        on_print_start: Callable[[dict], None] | None = None,
        on_print_complete: Callable[[dict], None] | None = None,
        on_ams_change: Callable[[list], None] | None = None,
    ):
        self.ip_address = ip_address
        self.serial_number = serial_number
        self.access_code = access_code
        self.on_state_change = on_state_change
        self.on_print_start = on_print_start
        self.on_print_complete = on_print_complete
        self.on_ams_change = on_ams_change

        self.state = PrinterState()
        self._client: mqtt.Client | None = None
        self._loop: asyncio.AbstractEventLoop | None = None
        self._previous_gcode_state: str | None = None
        self._previous_gcode_file: str | None = None
        self._was_running: bool = False  # Track if we've seen RUNNING state for current print
        self._completion_triggered: bool = False  # Prevent duplicate completion triggers
        self._message_log: deque[MQTTLogEntry] = deque(maxlen=100)
        self._logging_enabled: bool = False
        self._last_message_time: float = 0.0  # Track when we last received a message
        self._previous_ams_hash: str | None = None  # Track AMS changes

        # K-profile command tracking
        self._sequence_id: int = 0
        self._pending_kprofile_response: asyncio.Event | None = None
        self._kprofile_response_data: list | None = None

    @property
    def topic_subscribe(self) -> str:
        return f"device/{self.serial_number}/report"

    @property
    def topic_publish(self) -> str:
        return f"device/{self.serial_number}/request"

    def _on_connect(self, client, userdata, flags, rc, properties=None):
        if rc == 0:
            self.state.connected = True
            client.subscribe(self.topic_subscribe)
            # Request full status update (includes nozzle info in push_status response)
            self._request_push_all()
            # Note: get_accessories returns stale nozzle data on H2D, so we don't use it.
            # The correct nozzle data comes from push_status.
            # Prime K-profile request (Bambu printers often ignore first request)
            self._prime_kprofile_request()
            # Immediately broadcast connection state change
            if self.on_state_change:
                self.on_state_change(self.state)
        else:
            self.state.connected = False

    def _on_disconnect(self, client, userdata, disconnect_flags=None, rc=None, properties=None):
        # Ignore spurious disconnect callbacks if we've received a message recently
        # Paho-mqtt sometimes fires disconnect callbacks while the connection is still active
        time_since_last_message = time.time() - self._last_message_time
        if time_since_last_message < 30.0 and self._last_message_time > 0:
            logger.debug(
                f"[{self.serial_number}] Ignoring spurious disconnect (last message {time_since_last_message:.1f}s ago)"
            )
            return

        logger.warning(f"[{self.serial_number}] MQTT disconnected: rc={rc}, flags={disconnect_flags}")
        self.state.connected = False
        if self.on_state_change:
            self.on_state_change(self.state)

    def _on_message(self, client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode())
            # Track last message time - receiving a message proves we're connected
            self._last_message_time = time.time()
            self.state.connected = True
            # Log message if logging is enabled
            if self._logging_enabled:
                self._message_log.append(MQTTLogEntry(
                    timestamp=datetime.now().isoformat(),
                    topic=msg.topic,
                    direction="in",
                    payload=payload,
                ))
            self._process_message(payload)
        except json.JSONDecodeError:
            pass

    def _process_message(self, payload: dict):
        """Process incoming MQTT message from printer."""
        # Handle top-level AMS data (comes outside of "print" key)
        # Wrap in try/except to prevent breaking the MQTT connection
        if "ams" in payload:
            try:
                self._handle_ams_data(payload["ams"])
            except Exception as e:
                logger.error(f"[{self.serial_number}] Error handling AMS data: {e}")

        # Handle xcam data (camera settings) at top level
        if "xcam" in payload:
            xcam_data = payload["xcam"]
            logger.debug(f"[{self.serial_number}] Received xcam data: {xcam_data}")
            if isinstance(xcam_data, dict):
                if "ipcam_record" in xcam_data:
                    self.state.ipcam = xcam_data.get("ipcam_record") == "enable"
                if "timelapse" in xcam_data:
                    self.state.timelapse = xcam_data.get("timelapse") == "enable"

        # Handle system responses (accessories info, etc.)
        if "system" in payload:
            system_data = payload["system"]
            logger.info(f"[{self.serial_number}] Received system data: {system_data}")
            self._handle_system_response(system_data)

        if "print" in payload:
            print_data = payload["print"]
            # Log when we see gcode_state changes
            if "gcode_state" in print_data:
                logger.info(
                    f"[{self.serial_number}] Received gcode_state: {print_data.get('gcode_state')}, "
                    f"gcode_file: {print_data.get('gcode_file')}, subtask_name: {print_data.get('subtask_name')}"
                )

            # Handle AMS data that comes inside print key
            if "ams" in print_data:
                try:
                    self._handle_ams_data(print_data["ams"])
                except Exception as e:
                    logger.error(f"[{self.serial_number}] Error handling AMS data from print: {e}")

            # Handle vt_tray (virtual tray / external spool) data
            if "vt_tray" in print_data:
                self.state.raw_data["vt_tray"] = print_data["vt_tray"]

            # Check for K-profile response (extrusion_cali)
            if "command" in print_data:
                logger.debug(f"[{self.serial_number}] Received command response: {print_data.get('command')}")
            if "command" in print_data and print_data.get("command") == "extrusion_cali_get":
                self._handle_kprofile_response(print_data)

            self._update_state(print_data)

    def _handle_system_response(self, data: dict):
        """Handle system responses including accessories info.

        Note: get_accessories returns stale/incorrect nozzle_type data on H2D.
        The correct nozzle data comes from push_status, so we don't update
        nozzle type/diameter from get_accessories. We just log the response
        for debugging purposes.
        """
        command = data.get("command")

        if command == "get_accessories":
            # Log response for debugging - but DON'T use it to update nozzle data
            # because it returns stale values (e.g., 'stainless_steel' when the
            # actual nozzle is 'HH01' hardened steel high-flow)
            logger.info(f"[{self.serial_number}] Accessories response (not used for nozzle data): {data}")

    def _handle_ams_data(self, ams_data):
        """Handle AMS data changes for Spoolman integration.

        This is called when we receive top-level AMS data in MQTT messages.
        It detects changes and triggers the callback for Spoolman sync.
        """
        import hashlib

        # Handle nested ams structure: {"ams": {"ams": [...]}} or {"ams": [...]}
        if isinstance(ams_data, dict) and "ams" in ams_data:
            ams_list = ams_data["ams"]
        elif isinstance(ams_data, list):
            ams_list = ams_data
        else:
            logger.warning(f"[{self.serial_number}] Unexpected AMS data format: {type(ams_data)}")
            return

        # Store AMS data in raw_data so it's accessible via API
        self.state.raw_data["ams"] = ams_list
        logger.debug(f"[{self.serial_number}] Stored AMS data with {len(ams_list)} units")

        # Create a hash of relevant AMS data to detect changes
        ams_hash_data = []
        for ams_unit in ams_list:
            for tray in ams_unit.get("tray", []):
                # Include fields that matter for filament tracking
                ams_hash_data.append(
                    f"{ams_unit.get('id')}:{tray.get('id')}:"
                    f"{tray.get('tray_type')}:{tray.get('tag_uid')}:{tray.get('remain')}"
                )
        ams_hash = hashlib.md5(":".join(ams_hash_data).encode()).hexdigest()

        # Only trigger callback if AMS data actually changed
        if ams_hash != self._previous_ams_hash:
            self._previous_ams_hash = ams_hash
            if self.on_ams_change:
                logger.info(f"[{self.serial_number}] AMS data changed, triggering sync callback")
                self.on_ams_change(ams_list)

    def _update_state(self, data: dict):
        """Update printer state from message data."""
        previous_state = self.state.state

        # Update state fields
        if "gcode_state" in data:
            self.state.state = data["gcode_state"]
        if "gcode_file" in data:
            self.state.gcode_file = data["gcode_file"]
            self.state.current_print = data["gcode_file"]
        if "subtask_name" in data:
            self.state.subtask_name = data["subtask_name"]
            # Prefer subtask_name as current_print if available
            if data["subtask_name"]:
                self.state.current_print = data["subtask_name"]
        if "subtask_id" in data:
            self.state.subtask_id = data["subtask_id"]
        if "mc_percent" in data:
            self.state.progress = float(data["mc_percent"])
        if "mc_remaining_time" in data:
            self.state.remaining_time = int(data["mc_remaining_time"])
        if "layer_num" in data:
            self.state.layer_num = int(data["layer_num"])
        if "total_layer_num" in data:
            self.state.total_layers = int(data["total_layer_num"])

        # Temperature data
        temps = {}
        # Log all temperature-related fields for debugging (only when we have temp data)
        temp_fields = {k: v for k, v in data.items() if 'temp' in k.lower() or 'nozzle' in k.lower()}
        if temp_fields and not hasattr(self, '_temp_fields_logged'):
            logger.info(f"[{self.serial_number}] Temperature fields in MQTT data: {temp_fields}")
            self._temp_fields_logged = True

        # Log nozzle hardware info fields (once)
        nozzle_fields = {k: v for k, v in data.items() if 'nozzle' in k.lower() or 'hw' in k.lower() or 'extruder' in k.lower() or 'upgrade' in k.lower()}
        if nozzle_fields and not hasattr(self, '_nozzle_fields_logged'):
            logger.info(f"[{self.serial_number}] Nozzle/hardware fields in MQTT data: {nozzle_fields}")
            self._nozzle_fields_logged = True
        if "bed_temper" in data:
            temps["bed"] = float(data["bed_temper"])
        if "bed_target_temper" in data:
            temps["bed_target"] = float(data["bed_target_temper"])
        if "nozzle_temper" in data:
            temps["nozzle"] = float(data["nozzle_temper"])
        if "nozzle_target_temper" in data:
            temps["nozzle_target"] = float(data["nozzle_target_temper"])
        # Second nozzle for dual-extruder printers (H2 series)
        # Try multiple possible field names used by different firmware versions
        if "nozzle_temper_2" in data:
            temps["nozzle_2"] = float(data["nozzle_temper_2"])
        elif "right_nozzle_temper" in data:
            temps["nozzle_2"] = float(data["right_nozzle_temper"])
        if "nozzle_target_temper_2" in data:
            temps["nozzle_2_target"] = float(data["nozzle_target_temper_2"])
        elif "right_nozzle_target_temper" in data:
            temps["nozzle_2_target"] = float(data["right_nozzle_target_temper"])
        # Also check for left nozzle as primary (some H2 models)
        if "left_nozzle_temper" in data and "nozzle" not in temps:
            temps["nozzle"] = float(data["left_nozzle_temper"])
        if "left_nozzle_target_temper" in data and "nozzle_target" not in temps:
            temps["nozzle_target"] = float(data["left_nozzle_target_temper"])
        if "chamber_temper" in data:
            temps["chamber"] = float(data["chamber_temper"])
        if temps:
            self.state.temperatures = temps

        # Parse HMS (Health Management System) errors
        if "hms" in data:
            hms_list = data["hms"]
            self.state.hms_errors = []
            if isinstance(hms_list, list):
                for hms in hms_list:
                    if isinstance(hms, dict):
                        # HMS format: {"attr": code, "code": full_code}
                        # The code is a hex string, severity is in bits
                        code = hms.get("code", hms.get("attr", "0"))
                        if isinstance(code, int):
                            code = hex(code)
                        # Parse severity from code (typically last 4 bits indicate level)
                        try:
                            code_int = int(str(code).replace("0x", ""), 16) if code else 0
                            severity = (code_int >> 16) & 0xF  # Extract severity bits
                            module = (code_int >> 24) & 0xFF  # Extract module bits
                        except (ValueError, TypeError):
                            severity = 3
                            module = 0
                        self.state.hms_errors.append(HMSError(
                            code=str(code),
                            module=module,
                            severity=severity if severity > 0 else 3,
                        ))

        # Parse SD card status
        if "sdcard" in data:
            self.state.sdcard = data["sdcard"] is True

        # Parse timelapse status (recording active during print)
        if "timelapse" in data:
            logger.debug(f"[{self.serial_number}] timelapse field: {data['timelapse']}")
            self.state.timelapse = data["timelapse"] is True

        # Parse ipcam/live view status
        if "ipcam" in data:
            ipcam_data = data["ipcam"]
            logger.debug(f"[{self.serial_number}] ipcam field: {ipcam_data}")
            if isinstance(ipcam_data, dict):
                # Check ipcam_record field for live view status
                self.state.ipcam = ipcam_data.get("ipcam_record") == "enable"
            else:
                self.state.ipcam = ipcam_data is True

        # Parse nozzle hardware info (single nozzle printers)
        if "nozzle_type" in data:
            self.state.nozzles[0].nozzle_type = str(data["nozzle_type"])
        if "nozzle_diameter" in data:
            self.state.nozzles[0].nozzle_diameter = str(data["nozzle_diameter"])

        # Parse nozzle hardware info (dual nozzle printers - H2D series)
        # Left nozzle
        if "left_nozzle_type" in data:
            self.state.nozzles[0].nozzle_type = str(data["left_nozzle_type"])
        if "left_nozzle_diameter" in data:
            self.state.nozzles[0].nozzle_diameter = str(data["left_nozzle_diameter"])
        # Right nozzle
        if "right_nozzle_type" in data:
            self.state.nozzles[1].nozzle_type = str(data["right_nozzle_type"])
        if "right_nozzle_diameter" in data:
            self.state.nozzles[1].nozzle_diameter = str(data["right_nozzle_diameter"])

        # Alternative format for dual nozzle (nozzle_type_2, etc.)
        if "nozzle_type_2" in data:
            self.state.nozzles[1].nozzle_type = str(data["nozzle_type_2"])
        if "nozzle_diameter_2" in data:
            self.state.nozzles[1].nozzle_diameter = str(data["nozzle_diameter_2"])

        # Preserve AMS and vt_tray data when updating raw_data
        ams_data = self.state.raw_data.get("ams")
        vt_tray_data = self.state.raw_data.get("vt_tray")
        self.state.raw_data = data
        if ams_data is not None:
            self.state.raw_data["ams"] = ams_data
        if vt_tray_data is not None:
            self.state.raw_data["vt_tray"] = vt_tray_data

        # Log state transitions for debugging
        if "gcode_state" in data:
            logger.debug(
                f"[{self.serial_number}] gcode_state: {self._previous_gcode_state} -> {self.state.state}, "
                f"file: {self.state.gcode_file}, subtask: {self.state.subtask_name}"
            )

        # Detect print start (state changes TO RUNNING with a file)
        current_file = self.state.gcode_file or self.state.current_print
        is_new_print = (
            self.state.state == "RUNNING"
            and self._previous_gcode_state != "RUNNING"
            and current_file
        )
        # Also detect if file changed while running (new print started)
        is_file_change = (
            self.state.state == "RUNNING"
            and current_file
            and current_file != self._previous_gcode_file
            and self._previous_gcode_file is not None
        )

        # Track RUNNING state for more robust completion detection
        if self.state.state == "RUNNING" and current_file:
            if not self._was_running:
                logger.info(f"[{self.serial_number}] Now tracking RUNNING state for {current_file}")
            self._was_running = True
            self._completion_triggered = False

        if is_new_print or is_file_change:
            # Clear any old HMS errors when a new print starts
            self.state.hms_errors = []
            # Reset completion tracking for new print
            self._was_running = True
            self._completion_triggered = False

        if (is_new_print or is_file_change) and self.on_print_start:
            logger.info(
                f"[{self.serial_number}] PRINT START detected - file: {current_file}, "
                f"subtask: {self.state.subtask_name}, is_new: {is_new_print}, is_file_change: {is_file_change}"
            )
            self.on_print_start({
                "filename": current_file,
                "subtask_name": self.state.subtask_name,
                "raw_data": data,
            })

        # Detect print completion (FINISH = success, FAILED = error, IDLE = aborted)
        # Use _was_running flag in addition to _previous_gcode_state for more robust detection
        # This handles cases where server restarts during a print
        should_trigger_completion = (
            self.state.state in ("FINISH", "FAILED")
            and not self._completion_triggered
            and self.on_print_complete
            and (
                self._previous_gcode_state == "RUNNING"  # Normal transition
                or (self._was_running and self._previous_gcode_state != self.state.state)  # After server restart
            )
        )
        # For IDLE, only trigger if we just came from RUNNING (explicit abort/cancel)
        if (
            self.state.state == "IDLE"
            and self._previous_gcode_state == "RUNNING"
            and not self._completion_triggered
            and self.on_print_complete
        ):
            should_trigger_completion = True

        if should_trigger_completion:
            if self.state.state == "FINISH":
                status = "completed"
            elif self.state.state == "FAILED":
                status = "failed"
            else:
                status = "aborted"
            logger.info(
                f"[{self.serial_number}] PRINT COMPLETE detected - state: {self.state.state}, "
                f"status: {status}, file: {self._previous_gcode_file or current_file}, "
                f"subtask: {self.state.subtask_name}, was_running: {self._was_running}"
            )
            self._completion_triggered = True
            self._was_running = False
            self.on_print_complete({
                "status": status,
                "filename": self._previous_gcode_file or current_file,
                "subtask_name": self.state.subtask_name,
                "raw_data": data,
            })

        self._previous_gcode_state = self.state.state
        if current_file:
            self._previous_gcode_file = current_file

        if self.on_state_change:
            self.on_state_change(self.state)

    def _request_push_all(self):
        """Request full status update from printer."""
        if self._client:
            message = {"pushing": {"command": "pushall"}}
            self._client.publish(self.topic_publish, json.dumps(message))

    def request_status_update(self) -> bool:
        """Request a full status update from the printer (public API).

        Sends both pushall and get_accessories commands to refresh all data
        including nozzle hardware info.

        Returns:
            True if the request was sent, False if not connected.
        """
        if not self._client or not self.state.connected:
            return False
        self._request_push_all()
        # Note: get_accessories returns stale nozzle data on H2D.
        # The correct nozzle data comes from push_status response.
        return True

    def _request_accessories(self):
        """Request accessories info (nozzle type, etc.) from printer."""
        if self._client:
            self._sequence_id += 1
            message = {
                "system": {
                    "sequence_id": str(self._sequence_id),
                    "command": "get_accessories",
                    "accessory_type": "none"
                }
            }
            logger.debug(f"[{self.serial_number}] Requesting accessories info")
            self._client.publish(self.topic_publish, json.dumps(message))

    def _prime_kprofile_request(self):
        """Send a priming K-profile request on connect.

        Bambu printers often ignore the first K-profile request after connection,
        so we send a dummy request on connect to 'prime' the system.
        """
        if self._client:
            self._sequence_id += 1
            command = {
                "print": {
                    "command": "extrusion_cali_get",
                    "filament_id": "",
                    "nozzle_diameter": "0.4",
                    "sequence_id": str(self._sequence_id),
                }
            }
            logger.debug(f"[{self.serial_number}] Sending K-profile priming request")
            self._client.publish(self.topic_publish, json.dumps(command))

    def connect(self, loop: asyncio.AbstractEventLoop | None = None):
        """Connect to the printer MQTT broker.

        Args:
            loop: The asyncio event loop to use for thread-safe callbacks.
                  If not provided, will try to get the running loop.
        """
        self._loop = loop
        self._client = mqtt.Client(
            callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
            client_id=f"bambutrack_{self.serial_number}",
            protocol=mqtt.MQTTv311,
        )

        self._client.username_pw_set("bblp", self.access_code)
        self._client.on_connect = self._on_connect
        self._client.on_disconnect = self._on_disconnect
        self._client.on_message = self._on_message

        # TLS setup - Bambu uses self-signed certs
        ssl_context = ssl.create_default_context()
        ssl_context.check_hostname = False
        ssl_context.verify_mode = ssl.CERT_NONE
        self._client.tls_set_context(ssl_context)

        # Use shorter keepalive (15s) for faster disconnect detection
        # Paho considers connection lost after 1.5x keepalive with no response
        self._client.connect_async(self.ip_address, self.MQTT_PORT, keepalive=15)
        self._client.loop_start()

    def start_print(self, filename: str, plate_id: int = 1):
        """Start a print job on the printer.

        The file should already be uploaded to /cache/ on the printer via FTP.
        """
        if self._client and self.state.connected:
            # Bambu print command format
            # Based on: https://github.com/darkorb/bambu-ftp-and-print
            command = {
                "print": {
                    "sequence_id": 0,
                    "command": "project_file",
                    "param": f"Metadata/plate_{plate_id}.gcode",
                    "subtask_name": filename,
                    "url": f"ftp://{filename}",
                    "timelapse": False,
                    "bed_leveling": True,
                    "flow_cali": True,
                    "vibration_cali": True,
                    "layer_inspect": False,
                    "use_ams": True,
                }
            }
            logger.info(f"[{self.serial_number}] Sending print command: {json.dumps(command)}")
            self._client.publish(self.topic_publish, json.dumps(command))
            return True
        return False

    def stop_print(self) -> bool:
        """Stop the current print job."""
        if self._client and self.state.connected:
            command = {
                "print": {
                    "command": "stop",
                    "sequence_id": "0"
                }
            }
            self._client.publish(self.topic_publish, json.dumps(command))
            logger.info(f"[{self.serial_number}] Sent stop print command")
            return True
        return False

    def disconnect(self):
        """Disconnect from the printer."""
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()
            self._client = None
            self.state.connected = False

    def send_command(self, command: dict):
        """Send a command to the printer."""
        if self._client and self.state.connected:
            # Log outgoing message if logging is enabled
            if self._logging_enabled:
                self._message_log.append(MQTTLogEntry(
                    timestamp=datetime.now().isoformat(),
                    topic=self.topic_publish,
                    direction="out",
                    payload=command,
                ))
            self._client.publish(self.topic_publish, json.dumps(command))

    def enable_logging(self, enabled: bool = True):
        """Enable or disable MQTT message logging."""
        self._logging_enabled = enabled
        # Don't clear logs when stopping - user can manually clear with clear_logs()

    def get_logs(self) -> list[MQTTLogEntry]:
        """Get all logged MQTT messages."""
        return list(self._message_log)

    def clear_logs(self):
        """Clear the message log."""
        self._message_log.clear()

    @property
    def logging_enabled(self) -> bool:
        """Check if logging is enabled."""
        return self._logging_enabled

    def _handle_kprofile_response(self, data: dict):
        """Handle K-profile response from printer."""
        filaments = data.get("filaments", [])
        profiles = []

        # Log first profile to see what fields the printer returns
        if filaments and isinstance(filaments[0], dict):
            logger.debug(f"[{self.serial_number}] Raw K-profile fields: {list(filaments[0].keys())}")
            logger.debug(f"[{self.serial_number}] First K-profile: {filaments[0]}")

        for i, f in enumerate(filaments):
            if isinstance(f, dict):
                try:
                    # cali_idx is the actual slot/calibration index from the printer
                    cali_idx = f.get("cali_idx", i)
                    profiles.append(KProfile(
                        slot_id=cali_idx,
                        extruder_id=int(f.get("extruder_id", 0)),
                        nozzle_id=str(f.get("nozzle_id", "")),
                        nozzle_diameter=str(f.get("nozzle_diameter", "0.4")),
                        filament_id=str(f.get("filament_id", "")),
                        name=str(f.get("name", "")),
                        k_value=str(f.get("k_value", "0.000000")),
                        n_coef=str(f.get("n_coef", "0.000000")),
                        ams_id=int(f.get("ams_id", 0)),
                        tray_id=int(f.get("tray_id", -1)),
                        setting_id=f.get("setting_id"),
                    ))
                except (ValueError, TypeError) as e:
                    logger.warning(f"Failed to parse K-profile: {e}")

        self.state.kprofiles = profiles
        self._kprofile_response_data = profiles

        # Signal that we received the response
        # Use thread-safe method since MQTT callbacks run in a different thread
        if self._pending_kprofile_response:
            if self._loop and self._loop.is_running():
                self._loop.call_soon_threadsafe(self._pending_kprofile_response.set)
            else:
                # Fallback for when loop is not available
                self._pending_kprofile_response.set()

        logger.info(f"[{self.serial_number}] Received {len(profiles)} K-profiles")

    async def get_kprofiles(self, nozzle_diameter: str = "0.4", timeout: float = 5.0, max_retries: int = 3) -> list[KProfile]:
        """Request K-profiles from the printer with retry logic.

        Bambu printers sometimes ignore the first K-profile request, so we
        implement retry logic to ensure reliable retrieval.

        Args:
            nozzle_diameter: Filter by nozzle diameter (e.g., "0.4")
            timeout: Timeout in seconds to wait for each response attempt
            max_retries: Maximum number of retry attempts

        Returns:
            List of KProfile objects
        """
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot get K-profiles: not connected")
            return []

        # Capture current event loop for thread-safe callback
        try:
            self._loop = asyncio.get_running_loop()
        except RuntimeError:
            logger.warning(f"[{self.serial_number}] No running event loop")
            return []

        for attempt in range(max_retries):
            # Set up response event for this attempt
            self._sequence_id += 1
            self._pending_kprofile_response = asyncio.Event()
            self._kprofile_response_data = None

            # Send the command
            command = {
                "print": {
                    "command": "extrusion_cali_get",
                    "filament_id": "",
                    "nozzle_diameter": nozzle_diameter,
                    "sequence_id": str(self._sequence_id),
                }
            }

            logger.info(f"[{self.serial_number}] Requesting K-profiles for nozzle {nozzle_diameter} (attempt {attempt + 1}/{max_retries})")
            self._client.publish(self.topic_publish, json.dumps(command))

            # Wait for response
            try:
                await asyncio.wait_for(self._pending_kprofile_response.wait(), timeout=timeout)
                profiles = self._kprofile_response_data or []
                logger.info(f"[{self.serial_number}] Got {len(profiles)} K-profiles on attempt {attempt + 1}")
                return profiles
            except asyncio.TimeoutError:
                logger.warning(f"[{self.serial_number}] Timeout on K-profiles request attempt {attempt + 1}/{max_retries}")
                if attempt < max_retries - 1:
                    # Brief delay before retry
                    await asyncio.sleep(0.5)
            finally:
                self._pending_kprofile_response = None

        logger.error(f"[{self.serial_number}] Failed to get K-profiles after {max_retries} attempts")
        return []

    def set_kprofile(
        self,
        filament_id: str,
        name: str,
        k_value: str,
        nozzle_diameter: str = "0.4",
        nozzle_id: str = "HS00-0.4",
        extruder_id: int = 0,
        setting_id: str | None = None,
        slot_id: int = 0,
        cali_idx: int | None = None,
    ) -> bool:
        """Set/update a K-profile on the printer.

        Args:
            filament_id: Bambu filament identifier
            name: Profile name
            k_value: Pressure advance value (e.g., "0.020000")
            nozzle_diameter: Nozzle diameter (e.g., "0.4")
            nozzle_id: Nozzle identifier (e.g., "HS00-0.4")
            extruder_id: Extruder ID (0 or 1 for dual nozzle)
            setting_id: Existing setting ID for updates, None for new
            slot_id: Calibration index (cali_idx) for the profile
            cali_idx: For H2D edits, the existing slot being edited (enables in-place edit)

        Returns:
            True if command was sent, False otherwise
        """
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot set K-profile: not connected")
            return False

        self._sequence_id += 1

        # Detect printer type by serial number prefix
        # X1C/P1/A1 series (single nozzle): serial starts with "00M", "00W", "01P", "01S", "03W", etc.
        # H2D series (dual nozzle): serial starts with "094"
        is_dual_nozzle = self.serial_number.startswith("094")

        # For H2D edits, use empty setting_id per OrcaSlicer sniff
        # For new profiles, generate a setting_id
        import secrets
        if cali_idx is not None:
            # Edit mode - use empty setting_id per OrcaSlicer sniff
            setting_id = ""
        elif not setting_id and slot_id == 0:
            # New profile - generate setting_id
            setting_id = f"PFUS{secrets.token_hex(7)}"  # 7 bytes = 14 hex chars

        if is_dual_nozzle:
            # H2D format - exact OrcaSlicer format (captured via MQTT sniffing)
            # For edits: include cali_idx (existing slot), slot_id=0, setting_id=""
            # For new profiles: no cali_idx, slot_id=0, setting_id=generated
            filament_entry = {
                "ams_id": 0,
                "extruder_id": extruder_id,
                "filament_id": filament_id,
                "k_value": k_value,
                "n_coef": "0.000000",
                "name": name,
                "nozzle_diameter": nozzle_diameter,
                "nozzle_id": nozzle_id,
                "setting_id": setting_id if setting_id else "",
                "slot_id": slot_id,
                "tray_id": -1,
            }
            # For edits, add cali_idx field (position matters - alphabetical order)
            if cali_idx is not None:
                # Insert cali_idx in alphabetical position (after ams_id, before extruder_id)
                # n_coef must be "0.000000" for H2D edits (matches OrcaSlicer sniff)
                filament_entry = {
                    "ams_id": 0,
                    "cali_idx": cali_idx,
                    "extruder_id": extruder_id,
                    "filament_id": filament_id,
                    "k_value": k_value,
                    "n_coef": "0.000000",
                    "name": name,
                    "nozzle_diameter": nozzle_diameter,
                    "nozzle_id": nozzle_id,
                    "setting_id": "",
                    "slot_id": 0,
                    "tray_id": -1,
                }
            command = {
                "print": {
                    "command": "extrusion_cali_set",
                    "filaments": [filament_entry],
                    "nozzle_diameter": nozzle_diameter,
                    "sequence_id": str(self._sequence_id),
                }
            }
        else:
            # X1C/P1/A1 format - based on actual X1C profile data:
            # - n_coef: "1.000000" (NOT 0.000000 like H2D)
            # - nozzle_id: "" (empty string, NOT the nozzle type)
            # - tray_id: -1 (NOT 0)
            filament_entry = {
                "ams_id": 0,
                "extruder_id": 0,  # X1C is single nozzle
                "filament_id": filament_id,
                "k_value": k_value,
                "n_coef": "1.000000",  # X1C uses 1.0, not 0.0
                "name": name,
                "nozzle_diameter": nozzle_diameter,
                "nozzle_id": "",  # X1C uses empty string
                "setting_id": setting_id,
                "slot_id": slot_id,
                "tray_id": -1,  # X1C uses -1
            }
            command = {
                "print": {
                    "command": "extrusion_cali_set",
                    "filaments": [filament_entry],
                    "nozzle_diameter": nozzle_diameter,
                    "sequence_id": str(self._sequence_id),
                }
            }

        command_json = json.dumps(command)
        logger.info(f"[{self.serial_number}] Setting K-profile: {name} = {k_value} (cali_idx={cali_idx}, new={slot_id==0}, dual={is_dual_nozzle})")
        logger.info(f"[{self.serial_number}] K-profile SET command: {command_json}")
        # Use QoS 1 for reliable delivery (at least once)
        self._client.publish(self.topic_publish, command_json, qos=1)
        return True

    def delete_kprofile(
        self,
        cali_idx: int,
        filament_id: str,
        nozzle_id: str,
        nozzle_diameter: str = "0.4",
        extruder_id: int = 0,
        setting_id: str | None = None,
    ) -> bool:
        """Delete a K-profile from the printer.

        Args:
            cali_idx: The calibration index (slot_id) of the profile to delete
            filament_id: Bambu filament identifier
            nozzle_id: Nozzle identifier (e.g., "HH00-0.4")
            nozzle_diameter: Nozzle diameter (e.g., "0.4")
            extruder_id: Extruder ID (0 or 1 for dual nozzle)
            setting_id: Unique setting identifier (for X1C series)

        Returns:
            True if command was sent, False otherwise
        """
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot delete K-profile: not connected")
            return False

        self._sequence_id += 1

        # Detect printer type by serial number prefix
        # H2D series (dual nozzle): serial starts with "094"
        is_dual_nozzle = self.serial_number.startswith("094")

        if is_dual_nozzle:
            # H2D format: uses extruder_id, nozzle_id, nozzle_diameter
            command = {
                "print": {
                    "command": "extrusion_cali_del",
                    "sequence_id": str(self._sequence_id),
                    "extruder_id": extruder_id,
                    "nozzle_id": nozzle_id,
                    "filament_id": filament_id,
                    "cali_idx": cali_idx,
                    "nozzle_diameter": nozzle_diameter,
                }
            }
        else:
            # X1C/P1/A1 format: uses setting_id, nozzle_diameter, no extruder/nozzle_id fields
            command = {
                "print": {
                    "command": "extrusion_cali_del",
                    "sequence_id": str(self._sequence_id),
                    "filament_id": filament_id,
                    "cali_idx": cali_idx,
                    "setting_id": setting_id,
                    "nozzle_diameter": nozzle_diameter,
                }
            }

        command_json = json.dumps(command)
        logger.info(f"[{self.serial_number}] Deleting K-profile: cali_idx={cali_idx}, filament={filament_id}, dual={is_dual_nozzle}")
        logger.info(f"[{self.serial_number}] K-profile DELETE command: {command_json}")
        # Use QoS 1 for reliable delivery (at least once)
        self._client.publish(self.topic_publish, command_json, qos=1)
        return True

    # =========================================================================
    # Printer Control Commands
    # =========================================================================

    def pause_print(self) -> bool:
        """Pause the current print job."""
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot pause print: not connected")
            return False

        command = {
            "print": {
                "command": "pause",
                "sequence_id": "0"
            }
        }
        self._client.publish(self.topic_publish, json.dumps(command), qos=1)
        logger.info(f"[{self.serial_number}] Sent pause print command")
        return True

    def resume_print(self) -> bool:
        """Resume a paused print job."""
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot resume print: not connected")
            return False

        command = {
            "print": {
                "command": "resume",
                "sequence_id": "0"
            }
        }
        self._client.publish(self.topic_publish, json.dumps(command), qos=1)
        logger.info(f"[{self.serial_number}] Sent resume print command")
        return True

    def send_gcode(self, gcode: str) -> bool:
        """Send G-code command(s) to the printer.

        Multiple commands can be separated by newlines.

        Args:
            gcode: G-code command(s) to send

        Returns:
            True if command was sent, False otherwise
        """
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot send G-code: not connected")
            return False

        self._sequence_id += 1
        command = {
            "print": {
                "command": "gcode_line",
                "param": gcode,
                "sequence_id": str(self._sequence_id)
            }
        }
        self._client.publish(self.topic_publish, json.dumps(command))
        logger.debug(f"[{self.serial_number}] Sent G-code: {gcode[:50]}...")
        return True

    def set_bed_temperature(self, target: int) -> bool:
        """Set the bed target temperature.

        Args:
            target: Target temperature in Celsius (0 to turn off)

        Returns:
            True if command was sent, False otherwise
        """
        # Use M140 for non-blocking (preferred when not waiting)
        # Note: P1/A1 series with newer firmware may need M190 (blocking)
        return self.send_gcode(f"M140 S{target}")

    def set_nozzle_temperature(self, target: int, nozzle: int = 0) -> bool:
        """Set the nozzle target temperature.

        Args:
            target: Target temperature in Celsius (0 to turn off)
            nozzle: Nozzle index (0 for primary, 1 for secondary on H2D)

        Returns:
            True if command was sent, False otherwise
        """
        # Use M104 for non-blocking
        # For dual nozzle (H2D), T parameter selects the tool
        if nozzle == 0:
            return self.send_gcode(f"M104 S{target}")
        else:
            return self.send_gcode(f"M104 T{nozzle} S{target}")

    def set_print_speed(self, mode: int) -> bool:
        """Set the print speed mode.

        Args:
            mode: Speed mode (1=silent, 2=standard, 3=sport, 4=ludicrous)

        Returns:
            True if command was sent, False otherwise
        """
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot set print speed: not connected")
            return False

        if mode not in (1, 2, 3, 4):
            logger.warning(f"[{self.serial_number}] Invalid speed mode: {mode}")
            return False

        command = {
            "print": {
                "command": "print_speed",
                "param": str(mode),
                "sequence_id": "0"
            }
        }
        self._client.publish(self.topic_publish, json.dumps(command))
        logger.info(f"[{self.serial_number}] Set print speed mode to {mode}")
        return True

    def set_fan_speed(self, fan: int, speed: int) -> bool:
        """Set fan speed.

        Args:
            fan: Fan index (1=part cooling, 2=auxiliary, 3=chamber)
            speed: Speed 0-255 (0=off, 255=full)

        Returns:
            True if command was sent, False otherwise
        """
        if fan not in (1, 2, 3):
            logger.warning(f"[{self.serial_number}] Invalid fan index: {fan}")
            return False

        speed = max(0, min(255, speed))  # Clamp to 0-255
        return self.send_gcode(f"M106 P{fan} S{speed}")

    def set_part_fan(self, speed: int) -> bool:
        """Set part cooling fan speed (0-255)."""
        return self.set_fan_speed(1, speed)

    def set_aux_fan(self, speed: int) -> bool:
        """Set auxiliary fan speed (0-255)."""
        return self.set_fan_speed(2, speed)

    def set_chamber_fan(self, speed: int) -> bool:
        """Set chamber fan speed (0-255)."""
        return self.set_fan_speed(3, speed)

    def set_chamber_light(self, on: bool) -> bool:
        """Turn chamber light on or off.

        Args:
            on: True to turn on, False to turn off

        Returns:
            True if command was sent, False otherwise
        """
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot set chamber light: not connected")
            return False

        command = {
            "system": {
                "command": "ledctrl",
                "led_node": "chamber_light",
                "led_mode": "on" if on else "off",
                "led_on_time": 500,
                "led_off_time": 500,
                "loop_times": 0,
                "interval_time": 0,
                "sequence_id": "0"
            }
        }
        self._client.publish(self.topic_publish, json.dumps(command))
        logger.info(f"[{self.serial_number}] Set chamber light {'on' if on else 'off'}")
        return True

    def home_axes(self, axes: str = "XYZ") -> bool:
        """Home the specified axes.

        Args:
            axes: Axes to home (e.g., "XYZ", "X", "XY", "Z")

        Returns:
            True if command was sent, False otherwise
        """
        # G28 homes all axes, G28 X Y Z homes specific axes
        axes_param = " ".join(axes.upper())
        return self.send_gcode(f"G28 {axes_param}")

    def move_axis(self, axis: str, distance: float, speed: int = 3000) -> bool:
        """Move an axis by a relative distance.

        Args:
            axis: Axis to move ("X", "Y", or "Z")
            distance: Distance to move in mm (positive or negative)
            speed: Movement speed in mm/min

        Returns:
            True if command was sent, False otherwise
        """
        axis = axis.upper()
        if axis not in ("X", "Y", "Z"):
            logger.warning(f"[{self.serial_number}] Invalid axis: {axis}")
            return False

        # G91 = relative mode, G0 = rapid move, G90 = back to absolute
        gcode = f"G91\nG0 {axis}{distance:.2f} F{speed}\nG90"
        return self.send_gcode(gcode)

    def disable_motors(self) -> bool:
        """Disable all stepper motors.

        Warning: This will cause the printer to lose its position.
        A homing operation will be required before printing.

        Returns:
            True if command was sent, False otherwise
        """
        return self.send_gcode("M18")

    def enable_motors(self) -> bool:
        """Enable all stepper motors.

        Returns:
            True if command was sent, False otherwise
        """
        return self.send_gcode("M17")

    def ams_load_filament(self, tray_id: int) -> bool:
        """Load filament from a specific AMS tray.

        Args:
            tray_id: Tray ID (0-15 for AMS slots, or 254 for external spool)

        Returns:
            True if command was sent, False otherwise
        """
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot load filament: not connected")
            return False

        command = {
            "print": {
                "command": "ams_change_filament",
                "target": tray_id,
                "sequence_id": "0"
            }
        }
        self._client.publish(self.topic_publish, json.dumps(command))
        logger.info(f"[{self.serial_number}] Loading filament from tray {tray_id}")
        return True

    def ams_unload_filament(self) -> bool:
        """Unload the currently loaded filament.

        Returns:
            True if command was sent, False otherwise
        """
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot unload filament: not connected")
            return False

        command = {
            "print": {
                "command": "ams_change_filament",
                "target": 255,  # 255 = unload
                "sequence_id": "0"
            }
        }
        self._client.publish(self.topic_publish, json.dumps(command))
        logger.info(f"[{self.serial_number}] Unloading filament")
        return True

    def ams_control(self, action: str) -> bool:
        """Control AMS operations.

        Args:
            action: "resume", "reset", or "pause"

        Returns:
            True if command was sent, False otherwise
        """
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot control AMS: not connected")
            return False

        if action not in ("resume", "reset", "pause"):
            logger.warning(f"[{self.serial_number}] Invalid AMS action: {action}")
            return False

        command = {
            "print": {
                "command": "ams_control",
                "param": action,
                "sequence_id": "0"
            }
        }
        self._client.publish(self.topic_publish, json.dumps(command))
        logger.info(f"[{self.serial_number}] AMS control: {action}")
        return True

    def set_timelapse(self, enable: bool) -> bool:
        """Enable or disable timelapse recording.

        Args:
            enable: True to enable, False to disable

        Returns:
            True if command was sent, False otherwise
        """
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot set timelapse: not connected")
            return False

        command = {
            "pushing": {
                "command": "pushall",
                "sequence_id": "0"
            }
        }
        # First send the timelapse setting
        timelapse_cmd = {
            "print": {
                "command": "gcode_line",
                "param": f"M981 S{1 if enable else 0} P20000",
                "sequence_id": "0"
            }
        }
        self._client.publish(self.topic_publish, json.dumps(timelapse_cmd))
        # Request status update
        self._client.publish(self.topic_publish, json.dumps(command))
        logger.info(f"[{self.serial_number}] Set timelapse {'enabled' if enable else 'disabled'}")
        return True

    def set_liveview(self, enable: bool) -> bool:
        """Enable or disable live view / camera streaming.

        Args:
            enable: True to enable, False to disable

        Returns:
            True if command was sent, False otherwise
        """
        if not self._client or not self.state.connected:
            logger.warning(f"[{self.serial_number}] Cannot set liveview: not connected")
            return False

        command = {
            "xcam": {
                "command": "ipcam_record_set",
                "control": "enable" if enable else "disable",
                "sequence_id": "0"
            }
        }
        self._client.publish(self.topic_publish, json.dumps(command))
        # Request status update
        pushall = {
            "pushing": {
                "command": "pushall",
                "sequence_id": "0"
            }
        }
        self._client.publish(self.topic_publish, json.dumps(pushall))
        logger.info(f"[{self.serial_number}] Set liveview {'enabled' if enable else 'disabled'}")
        return True
