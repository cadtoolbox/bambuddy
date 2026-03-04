"""Tests for the strict color match feature in the print scheduler."""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.app.services.print_scheduler import PrintScheduler


def _make_printer_status(ams_trays=None, vt_tray=None):
    """Helper to build a mock printer status with given filaments."""
    ams = []
    if ams_trays:
        ams = [{"id": 0, "tray": [{"id": i, "tray_type": t, "tray_color": c} for i, (t, c) in enumerate(ams_trays)]}]
    vt = vt_tray or []
    return MagicMock(raw_data={"ams": ams, "vt_tray": vt})


class TestCheckStrictFilamentMatch:
    """Tests for _check_strict_filament_match helper method."""

    @pytest.fixture
    def scheduler(self):
        return PrintScheduler()

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_all_match_returns_none(self, mock_pm, scheduler):
        """When all required filaments are loaded with exact type+color, returns None."""
        mock_pm.get_status.return_value = _make_printer_status(
            ams_trays=[("PLA", "FF0000FF"), ("PETG", "00FF00FF")]
        )
        reqs = [
            {"type": "PLA", "color": "#FF0000"},
            {"type": "PETG", "color": "#00FF00"},
        ]
        assert scheduler._check_strict_filament_match(1, reqs) is None

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_missing_color_returns_reason(self, mock_pm, scheduler):
        """When one filament has wrong color, returns a waiting reason."""
        mock_pm.get_status.return_value = _make_printer_status(
            ams_trays=[("PLA", "FF0000FF")]  # Red PLA loaded
        )
        reqs = [{"type": "PLA", "color": "#0000FF"}]  # Blue PLA required
        result = scheduler._check_strict_filament_match(1, reqs)
        assert result is not None
        assert "PLA" in result

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_missing_type_returns_reason(self, mock_pm, scheduler):
        """When the required type is not loaded at all, returns a waiting reason."""
        mock_pm.get_status.return_value = _make_printer_status(
            ams_trays=[("PLA", "FF0000FF")]
        )
        reqs = [{"type": "PETG", "color": "#FF0000"}]
        result = scheduler._check_strict_filament_match(1, reqs)
        assert result is not None
        assert "PETG" in result

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_empty_reqs_returns_none(self, mock_pm, scheduler):
        """Empty requirements list always passes."""
        mock_pm.get_status.return_value = _make_printer_status()
        assert scheduler._check_strict_filament_match(1, []) is None

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_no_printer_status_returns_reason(self, mock_pm, scheduler):
        """When printer status is unavailable, returns a waiting reason."""
        mock_pm.get_status.return_value = None
        reqs = [{"type": "PLA", "color": "#FF0000"}]
        result = scheduler._check_strict_filament_match(1, reqs)
        assert result is not None

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_partial_match_returns_reason(self, mock_pm, scheduler):
        """When only some of multiple required filaments match, returns a waiting reason."""
        mock_pm.get_status.return_value = _make_printer_status(
            ams_trays=[("PLA", "FF0000FF")]  # Only red PLA
        )
        reqs = [
            {"type": "PLA", "color": "#FF0000"},   # Matches
            {"type": "PETG", "color": "#00FF00"},  # Missing
        ]
        result = scheduler._check_strict_filament_match(1, reqs)
        assert result is not None
        assert "PETG" in result

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_external_spool_match(self, mock_pm, scheduler):
        """Filaments in vt_tray (external spool) also satisfy strict match."""
        mock_pm.get_status.return_value = _make_printer_status(
            ams_trays=[],
            vt_tray=[{"tray_type": "TPU", "tray_color": "0000FFFF"}],
        )
        reqs = [{"type": "TPU", "color": "#0000FF"}]
        assert scheduler._check_strict_filament_match(1, reqs) is None


class TestFindIdlePrinterStrictColorMatch:
    """Tests for strict_color_match parameter in _find_idle_printer_for_model."""

    @pytest.fixture
    def scheduler(self):
        return PrintScheduler()

    def _make_printer(self, printer_id, name, model="X1C"):
        p = MagicMock()
        p.id = printer_id
        p.name = name
        p.model = model
        return p

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_strict_mode_all_overrides_match(self, mock_pm, scheduler):
        """Strict mode with overrides: only assigns when ALL overrides match."""
        mock_pm.is_connected.return_value = True
        mock_pm.get_status.return_value = _make_printer_status(
            ams_trays=[("PLA", "FF0000FF"), ("PETG", "00FF00FF")]
        )

        printer = self._make_printer(1, "Printer A")
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [printer]
        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        with patch.object(scheduler, "_is_printer_idle", return_value=True):
            overrides = [
                {"type": "PLA", "color": "#FF0000"},
                {"type": "PETG", "color": "#00FF00"},
            ]
            printer_id, reason = await scheduler._find_idle_printer_for_model(
                db, "X1C", set(),
                filament_overrides=overrides,
                strict_color_match=True,
            )
        assert printer_id == 1
        assert reason is None

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_strict_mode_partial_overrides_no_match(self, mock_pm, scheduler):
        """Strict mode with overrides: holds in queue when only partial match."""
        mock_pm.is_connected.return_value = True
        mock_pm.get_status.return_value = _make_printer_status(
            ams_trays=[("PLA", "FF0000FF")]  # Only red PLA
        )

        printer = self._make_printer(1, "Printer A")
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [printer]
        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        with patch.object(scheduler, "_is_printer_idle", return_value=True):
            overrides = [
                {"type": "PLA", "color": "#FF0000"},   # Loaded
                {"type": "PETG", "color": "#00FF00"},  # NOT loaded
            ]
            printer_id, reason = await scheduler._find_idle_printer_for_model(
                db, "X1C", set(),
                filament_overrides=overrides,
                strict_color_match=True,
            )
        assert printer_id is None
        assert reason is not None  # Should explain why waiting

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_non_strict_mode_partial_overrides_matches(self, mock_pm, scheduler):
        """Non-strict mode with overrides: assigns when at least one override color matches."""
        mock_pm.is_connected.return_value = True
        mock_pm.get_status.return_value = _make_printer_status(
            ams_trays=[("PLA", "FF0000FF")]  # Only red PLA
        )

        printer = self._make_printer(1, "Printer A")
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [printer]
        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        with patch.object(scheduler, "_is_printer_idle", return_value=True):
            overrides = [
                {"type": "PLA", "color": "#FF0000"},   # Loaded -> 1 match
                {"type": "PETG", "color": "#00FF00"},  # NOT loaded
            ]
            printer_id, reason = await scheduler._find_idle_printer_for_model(
                db, "X1C", set(),
                filament_overrides=overrides,
                strict_color_match=False,
            )
        assert printer_id == 1  # Assigned because at least 1 matched
        assert reason is None

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_strict_mode_no_overrides_uses_strict_color_reqs(self, mock_pm, scheduler):
        """Strict mode without overrides uses strict_color_reqs for exact match."""
        mock_pm.is_connected.return_value = True
        mock_pm.get_status.return_value = _make_printer_status(
            ams_trays=[("PLA", "FF0000FF"), ("PETG", "00FF00FF")]
        )

        printer = self._make_printer(1, "Printer A")
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [printer]
        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        with patch.object(scheduler, "_is_printer_idle", return_value=True):
            strict_reqs = [
                {"type": "PLA", "color": "#FF0000"},
                {"type": "PETG", "color": "#00FF00"},
            ]
            printer_id, reason = await scheduler._find_idle_printer_for_model(
                db, "X1C", set(),
                strict_color_match=True,
                strict_color_reqs=strict_reqs,
            )
        assert printer_id == 1
        assert reason is None

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_strict_mode_no_overrides_wrong_color_holds(self, mock_pm, scheduler):
        """Strict mode without overrides holds in queue when 3MF colors don't match."""
        mock_pm.is_connected.return_value = True
        mock_pm.get_status.return_value = _make_printer_status(
            ams_trays=[("PLA", "FF0000FF")]  # Red PLA only
        )

        printer = self._make_printer(1, "Printer A")
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [printer]
        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        with patch.object(scheduler, "_is_printer_idle", return_value=True):
            strict_reqs = [{"type": "PLA", "color": "#0000FF"}]  # Blue PLA required
            printer_id, reason = await scheduler._find_idle_printer_for_model(
                db, "X1C", set(),
                strict_color_match=True,
                strict_color_reqs=strict_reqs,
            )
        assert printer_id is None
        assert reason is not None

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_strict_mode_prefers_printer_with_most_matches(self, mock_pm, scheduler):
        """Strict mode with all-matching overrides: picks best (most) matching printer."""
        mock_pm.is_connected.return_value = True

        # Printer A has both colors; Printer B has only one color
        status_a = _make_printer_status(ams_trays=[("PLA", "FF0000FF"), ("PETG", "00FF00FF")])
        status_b = _make_printer_status(ams_trays=[("PLA", "FF0000FF")])

        printer_a = self._make_printer(1, "Printer A")
        printer_b = self._make_printer(2, "Printer B")

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [printer_a, printer_b]
        db = AsyncMock()
        db.execute = AsyncMock(return_value=mock_result)

        def get_status(pid):
            return status_a if pid == 1 else status_b

        mock_pm.get_status.side_effect = get_status

        with patch.object(scheduler, "_is_printer_idle", return_value=True):
            overrides = [
                {"type": "PLA", "color": "#FF0000"},
                {"type": "PETG", "color": "#00FF00"},
            ]
            printer_id, reason = await scheduler._find_idle_printer_for_model(
                db, "X1C", set(),
                filament_overrides=overrides,
                strict_color_match=True,
            )
        # Only printer A has all 2 matches required by strict mode
        assert printer_id == 1
        assert reason is None
