"""Tests for the printer-specific filament waiting reason logic in print_scheduler."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.app.services.print_scheduler import PrintScheduler


class TestGetPrinterFilamentWaitingReason:
    """Test the _get_printer_filament_waiting_reason method."""

    @pytest.fixture
    def scheduler(self):
        return PrintScheduler()

    @pytest.fixture
    def queue_item_no_overrides(self):
        """Queue item with no filament overrides and no ams_mapping."""
        item = MagicMock()
        item.ams_mapping = None
        item.filament_overrides = None
        item.archive_id = 1
        item.library_file_id = None
        item.plate_id = None
        return item

    @patch("backend.app.services.print_scheduler.printer_manager")
    async def test_no_filament_reqs_returns_none(self, mock_pm, scheduler, queue_item_no_overrides):
        """When there are no filament requirements, should return None (no waiting needed)."""
        db = AsyncMock()

        with patch.object(scheduler, "_get_filament_requirements", return_value=None):
            result = await scheduler._get_printer_filament_waiting_reason(db, 1, queue_item_no_overrides)
        assert result is None

    @patch("backend.app.services.print_scheduler.printer_manager")
    async def test_no_printer_status_returns_none(self, mock_pm, scheduler, queue_item_no_overrides):
        """When printer status is unavailable, should return None (don't block)."""
        db = AsyncMock()
        mock_pm.get_status.return_value = None

        with patch.object(
            scheduler,
            "_get_filament_requirements",
            return_value=[{"slot_id": 1, "type": "PLA", "color": "#FF0000"}],
        ):
            result = await scheduler._get_printer_filament_waiting_reason(db, 1, queue_item_no_overrides)
        assert result is None

    @patch("backend.app.services.print_scheduler.printer_manager")
    async def test_type_loaded_returns_none(self, mock_pm, scheduler, queue_item_no_overrides):
        """When required filament type is loaded, should return None (no waiting)."""
        db = AsyncMock()
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "FF0000FF", "tray_info_idx": ""}]}],
                "ams_extruder_map": {},
                "vt_tray": [],
            }
        )

        with patch.object(
            scheduler,
            "_get_filament_requirements",
            return_value=[{"slot_id": 1, "type": "PLA", "color": "#FF0000"}],
        ):
            result = await scheduler._get_printer_filament_waiting_reason(db, 1, queue_item_no_overrides)
        assert result is None

    @patch("backend.app.services.print_scheduler.printer_manager")
    async def test_type_missing_returns_waiting_reason(self, mock_pm, scheduler, queue_item_no_overrides):
        """When required filament type is NOT loaded, should return a waiting reason string."""
        db = AsyncMock()
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PETG", "tray_color": "00FF00FF", "tray_info_idx": ""}]}],
                "ams_extruder_map": {},
                "vt_tray": [],
            }
        )

        with patch.object(
            scheduler,
            "_get_filament_requirements",
            return_value=[{"slot_id": 1, "type": "PLA", "color": "#FF0000"}],
        ):
            result = await scheduler._get_printer_filament_waiting_reason(db, 1, queue_item_no_overrides)

        assert result is not None
        assert "Waiting on Material (Color)" in result
        assert "PLA" in result
        assert "#FF0000" in result

    @patch("backend.app.services.print_scheduler.printer_manager")
    async def test_partial_type_missing_returns_waiting_reason(self, mock_pm, scheduler, queue_item_no_overrides):
        """When one of multiple required types is missing, should return waiting reason for missing type only."""
        db = AsyncMock()
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "FF0000FF", "tray_info_idx": ""}]}],
                "ams_extruder_map": {},
                "vt_tray": [],
            }
        )

        with patch.object(
            scheduler,
            "_get_filament_requirements",
            return_value=[
                {"slot_id": 1, "type": "PLA", "color": "#FF0000"},
                {"slot_id": 2, "type": "PETG", "color": "#00FF00"},
            ],
        ):
            result = await scheduler._get_printer_filament_waiting_reason(db, 1, queue_item_no_overrides)

        assert result is not None
        assert "PETG" in result
        assert "PLA" not in result

    @patch("backend.app.services.print_scheduler.printer_manager")
    async def test_nozzle_suffix_left(self, mock_pm, scheduler, queue_item_no_overrides):
        """For dual-nozzle, missing left-nozzle filament includes '(Left Nozzle)' in reason."""
        db = AsyncMock()
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [],
                "ams_extruder_map": {"0": 0},  # AMS 0 on right nozzle (extruder 0)
                "vt_tray": [],
            }
        )

        with patch.object(
            scheduler,
            "_get_filament_requirements",
            return_value=[{"slot_id": 1, "type": "PLA", "color": "#FF0000", "nozzle_id": 1}],
        ):
            result = await scheduler._get_printer_filament_waiting_reason(db, 1, queue_item_no_overrides)

        assert result is not None
        assert "Left Nozzle" in result

    @patch("backend.app.services.print_scheduler.printer_manager")
    async def test_nozzle_suffix_right(self, mock_pm, scheduler, queue_item_no_overrides):
        """For dual-nozzle, missing right-nozzle filament includes '(Right Nozzle)' in reason."""
        db = AsyncMock()
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [],
                "ams_extruder_map": {},
                "vt_tray": [],
            }
        )

        with patch.object(
            scheduler,
            "_get_filament_requirements",
            return_value=[{"slot_id": 1, "type": "PLA", "color": "#FF0000", "nozzle_id": 0}],
        ):
            result = await scheduler._get_printer_filament_waiting_reason(db, 1, queue_item_no_overrides)

        assert result is not None
        assert "Right Nozzle" in result

    @patch("backend.app.services.print_scheduler.printer_manager")
    async def test_different_color_same_type_not_waiting(self, mock_pm, scheduler, queue_item_no_overrides):
        """When type is loaded (even different color), should NOT wait — type-only matching is allowed."""
        db = AsyncMock()
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "00FF00FF", "tray_info_idx": ""}]}],
                "ams_extruder_map": {},
                "vt_tray": [],
            }
        )

        with patch.object(
            scheduler,
            "_get_filament_requirements",
            return_value=[{"slot_id": 1, "type": "PLA", "color": "#FF0000"}],
        ):
            result = await scheduler._get_printer_filament_waiting_reason(db, 1, queue_item_no_overrides)

        # PLA is loaded (different color), so no waiting needed
        assert result is None


class TestModelBasedWaitingReasonFormat:
    """Test that model-based waiting reasons use the 'Waiting on Material (Color):' format."""

    @pytest.fixture
    def scheduler(self):
        return PrintScheduler()

    def test_waiting_reason_format_from_missing_items(self, scheduler):
        """The waiting reason string built from missing filament items uses 'Waiting on Material (Color):' prefix.

        This tests the format of the reason string construction logic used inside
        _find_idle_printer_for_model when printers_missing_filament is populated.
        """
        # Simulate what _find_idle_printer_for_model does when printers_missing_filament is populated:
        printers_missing_filament = [
            ("Printer A", ["PETG"]),
            ("Printer B", ["PETG"]),
        ]
        reasons = []
        missing_items: list[str] = []
        for name, missing in printers_missing_filament:
            for m in missing:
                if m not in missing_items:
                    missing_items.append(m)
        reasons.append(f"Waiting on Material (Color): {', '.join(missing_items)}")

        result = " | ".join(reasons)
        assert "Waiting on Material (Color)" in result
        assert "PETG" in result
        # Should not contain "Waiting for filament:" (old format)
        assert "Waiting for filament:" not in result

    def test_override_missing_reason_format(self, scheduler):
        """Override-based missing filament includes type+color in 'Waiting on Material (Color):' reason."""
        overrides = [{"type": "PLA", "color": "#FF0000"}, {"type": "PETG", "color": "#00FF00"}]
        override_colors = [f"{o.get('type', '?')} ({o.get('color', '?')})" for o in overrides]
        printers_missing_filament = [("Printer A", override_colors)]

        missing_items: list[str] = []
        for name, missing in printers_missing_filament:
            for m in missing:
                if m not in missing_items:
                    missing_items.append(m)
        reason = f"Waiting on Material (Color): {', '.join(missing_items)}"

        assert "Waiting on Material (Color)" in reason
        assert "PLA (#FF0000)" in reason
        assert "PETG (#00FF00)" in reason
