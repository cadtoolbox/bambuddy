"""Configuration loader for SpoolBuddy daemon."""

import os
from dataclasses import dataclass
from pathlib import Path

import yaml

CONFIG_PATH = Path(os.environ.get("SPOOLBUDDY_CONFIG", "/etc/spoolbuddy/config.yaml"))


@dataclass
class Config:
    backend_url: str = "http://localhost:5000"
    api_key: str = ""
    device_id: str = ""
    hostname: str = ""

    nfc_poll_interval: float = 0.3
    scale_read_interval: float = 0.1
    scale_report_interval: float = 1.0
    heartbeat_interval: float = 10.0
    stability_threshold: float = 2.0
    stability_window: float = 1.0

    tare_offset: int = 0
    calibration_factor: float = 1.0

    @classmethod
    def load(cls) -> "Config":
        cfg = cls()

        # Load from YAML if exists
        if CONFIG_PATH.exists():
            with open(CONFIG_PATH) as f:
                data = yaml.safe_load(f) or {}
            for key, val in data.items():
                if hasattr(cfg, key):
                    setattr(cfg, key, val)

        # Environment overrides
        env_map = {
            "SPOOLBUDDY_BACKEND_URL": "backend_url",
            "SPOOLBUDDY_API_KEY": "api_key",
            "SPOOLBUDDY_DEVICE_ID": "device_id",
            "SPOOLBUDDY_HOSTNAME": "hostname",
        }
        for env_key, attr in env_map.items():
            val = os.environ.get(env_key)
            if val:
                setattr(cfg, attr, val)

        # Default device_id from MAC address
        if not cfg.device_id:
            cfg.device_id = _get_mac_id()

        # Default hostname from system
        if not cfg.hostname:
            import socket

            cfg.hostname = socket.gethostname()

        return cfg


def _get_mac_id() -> str:
    """Generate a device ID from the primary network interface MAC address."""
    try:
        for iface in Path("/sys/class/net").iterdir():
            if iface.name == "lo":
                continue
            addr_file = iface / "address"
            if addr_file.exists():
                mac = addr_file.read_text().strip().replace(":", "")
                if mac and mac != "000000000000":
                    return f"sb-{mac}"
    except Exception:
        pass
    import uuid

    return f"sb-{uuid.uuid4().hex[:12]}"
