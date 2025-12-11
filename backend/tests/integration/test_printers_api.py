"""Integration tests for Printers API endpoints.

Tests the full request/response cycle for /api/v1/printers/ endpoints.
"""

import pytest
from httpx import AsyncClient
from unittest.mock import patch, MagicMock, AsyncMock


class TestPrintersAPI:
    """Integration tests for /api/v1/printers/ endpoints."""

    # ========================================================================
    # List endpoints
    # ========================================================================

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_list_printers_empty(self, async_client: AsyncClient):
        """Verify empty list is returned when no printers exist."""
        response = await async_client.get("/api/v1/printers/")

        assert response.status_code == 200
        assert response.json() == []

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_list_printers_with_data(
        self, async_client: AsyncClient, printer_factory, db_session
    ):
        """Verify list returns existing printers."""
        printer = await printer_factory(name="Test Printer")

        response = await async_client.get("/api/v1/printers/")

        assert response.status_code == 200
        data = response.json()
        assert len(data) >= 1
        assert any(p["name"] == "Test Printer" for p in data)

    # ========================================================================
    # Create endpoints
    # ========================================================================

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_create_printer(self, async_client: AsyncClient):
        """Verify printer can be created."""
        data = {
            "name": "New Printer",
            "serial_number": "00M09A111111111",
            "ip_address": "192.168.1.100",
            "access_code": "12345678",
            "is_active": True,
            "model": "X1C",
        }

        response = await async_client.post("/api/v1/printers/", json=data)

        assert response.status_code == 200
        result = response.json()
        assert result["name"] == "New Printer"
        assert result["serial_number"] == "00M09A111111111"
        assert result["model"] == "X1C"

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_create_printer_duplicate_serial(
        self, async_client: AsyncClient, printer_factory, db_session
    ):
        """Verify duplicate serial number is rejected."""
        await printer_factory(serial_number="00M09A222222222")

        data = {
            "name": "Duplicate Printer",
            "serial_number": "00M09A222222222",
            "ip_address": "192.168.1.101",
            "access_code": "12345678",
        }

        response = await async_client.post("/api/v1/printers/", json=data)

        # Should fail due to duplicate serial
        assert response.status_code in [400, 409, 422, 500]

    # ========================================================================
    # Get single endpoint
    # ========================================================================

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_get_printer(
        self, async_client: AsyncClient, printer_factory, db_session
    ):
        """Verify single printer can be retrieved."""
        printer = await printer_factory(name="Get Test Printer")

        response = await async_client.get(f"/api/v1/printers/{printer.id}")

        assert response.status_code == 200
        result = response.json()
        assert result["id"] == printer.id
        assert result["name"] == "Get Test Printer"

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_get_printer_not_found(self, async_client: AsyncClient):
        """Verify 404 for non-existent printer."""
        response = await async_client.get("/api/v1/printers/9999")

        assert response.status_code == 404

    # ========================================================================
    # Update endpoints
    # ========================================================================

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_update_printer_name(
        self, async_client: AsyncClient, printer_factory, db_session
    ):
        """Verify printer name can be updated."""
        printer = await printer_factory(name="Original Name")

        response = await async_client.patch(
            f"/api/v1/printers/{printer.id}",
            json={"name": "Updated Name"}
        )

        assert response.status_code == 200
        assert response.json()["name"] == "Updated Name"

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_update_printer_active_status(
        self, async_client: AsyncClient, printer_factory, db_session
    ):
        """Verify printer active status can be updated."""
        printer = await printer_factory(is_active=True)

        response = await async_client.patch(
            f"/api/v1/printers/{printer.id}",
            json={"is_active": False}
        )

        assert response.status_code == 200
        assert response.json()["is_active"] is False

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_update_printer_auto_archive(
        self, async_client: AsyncClient, printer_factory, db_session
    ):
        """Verify auto_archive setting can be updated."""
        printer = await printer_factory(auto_archive=True)

        response = await async_client.patch(
            f"/api/v1/printers/{printer.id}",
            json={"auto_archive": False}
        )

        assert response.status_code == 200
        assert response.json()["auto_archive"] is False

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_update_nonexistent_printer(self, async_client: AsyncClient):
        """Verify updating non-existent printer returns 404."""
        response = await async_client.patch(
            "/api/v1/printers/9999",
            json={"name": "New Name"}
        )

        assert response.status_code == 404

    # ========================================================================
    # Delete endpoints
    # ========================================================================

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_delete_printer(
        self, async_client: AsyncClient, printer_factory, db_session
    ):
        """Verify printer can be deleted."""
        printer = await printer_factory()
        printer_id = printer.id

        response = await async_client.delete(f"/api/v1/printers/{printer_id}")

        assert response.status_code == 200

        # Verify deleted
        response = await async_client.get(f"/api/v1/printers/{printer_id}")
        assert response.status_code == 404

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_delete_nonexistent_printer(self, async_client: AsyncClient):
        """Verify deleting non-existent printer returns 404."""
        response = await async_client.delete("/api/v1/printers/9999")

        assert response.status_code == 404

    # ========================================================================
    # Status endpoint
    # ========================================================================

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_get_printer_status(
        self, async_client: AsyncClient, printer_factory, mock_printer_manager, db_session
    ):
        """Verify printer status can be retrieved."""
        printer = await printer_factory()

        response = await async_client.get(f"/api/v1/printers/{printer.id}/status")

        assert response.status_code == 200
        result = response.json()
        assert "connected" in result
        assert "state" in result

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_get_printer_status_not_found(self, async_client: AsyncClient):
        """Verify 404 for status of non-existent printer."""
        response = await async_client.get("/api/v1/printers/9999/status")

        assert response.status_code == 404

    # ========================================================================
    # Test connection endpoint
    # ========================================================================

class TestPrinterDataIntegrity:
    """Tests for printer data integrity."""

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_printer_stores_all_fields(
        self, async_client: AsyncClient, printer_factory, db_session
    ):
        """Verify printer stores all fields correctly."""
        printer = await printer_factory(
            name="Full Test Printer",
            serial_number="00M09A444444444",
            ip_address="192.168.1.150",
            model="P1S",
            is_active=True,
            auto_archive=False,
        )

        response = await async_client.get(f"/api/v1/printers/{printer.id}")

        assert response.status_code == 200
        result = response.json()
        assert result["name"] == "Full Test Printer"
        assert result["serial_number"] == "00M09A444444444"
        assert result["ip_address"] == "192.168.1.150"
        assert result["model"] == "P1S"
        assert result["is_active"] is True
        assert result["auto_archive"] is False

    @pytest.mark.asyncio
    @pytest.mark.integration
    async def test_printer_update_persists(
        self, async_client: AsyncClient, printer_factory, db_session
    ):
        """CRITICAL: Verify printer updates persist."""
        printer = await printer_factory(name="Original", is_active=True)

        # Update
        await async_client.patch(
            f"/api/v1/printers/{printer.id}",
            json={"name": "Updated", "is_active": False}
        )

        # Verify persistence
        response = await async_client.get(f"/api/v1/printers/{printer.id}")
        result = response.json()
        assert result["name"] == "Updated"
        assert result["is_active"] is False
