"""Quick test to verify AMS label save endpoint."""

import pytest
from httpx import AsyncClient


class TestAMSLabelAPI:
    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_save_ams_label(self, async_client: AsyncClient):
        """Test saving an AMS label for a printer."""
        # Create a printer
        r = await async_client.post(
            "/api/v1/printers/",
            json={
                "name": "Label Test Printer",
                "ip_address": "192.168.1.100",
                "access_code": "12345678",
                "serial_number": "LBL123",
            },
        )
        assert r.status_code == 200, f"Create printer failed: {r.text}"
        printer_id = r.json()["id"]
        
        # Try to save AMS label
        r2 = await async_client.put(
            f"/api/v1/printers/{printer_id}/ams-labels/0?label=TestLabel"
        )
        print(f"Save AMS label status: {r2.status_code}")
        print(f"Response: {r2.text[:500]}")
        assert r2.status_code == 200, f"Save AMS label failed: {r2.text}"
