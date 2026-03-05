"""Tests for the filament override feature in the print scheduler."""

from unittest.mock import MagicMock, patch

import pytest

from backend.app.services.print_scheduler import PrintScheduler


class TestCountOverrideColorMatches:
    """Test the _count_override_color_matches method."""

    @pytest.fixture
    def scheduler(self):
        return PrintScheduler()

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_no_status_returns_zero(self, mock_pm, scheduler):
        """When printer_manager.get_status() returns None, should return 0."""
        mock_pm.get_status.return_value = None

        result = scheduler._count_override_color_matches(1, [{"type": "PLA", "color": "#FF0000"}])
        assert result == 0

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_exact_match(self, mock_pm, scheduler):
        """Override with matching type+color on printer returns 1."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "FF0000FF"}]}],
            }
        )

        result = scheduler._count_override_color_matches(1, [{"type": "PLA", "color": "#FF0000"}])
        assert result == 1

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_no_match(self, mock_pm, scheduler):
        """Override with type+color not on printer returns 0."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "FF0000FF"}]}],
            }
        )

        result = scheduler._count_override_color_matches(1, [{"type": "PETG", "color": "#00FF00"}])
        assert result == 0

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_multiple_overrides_partial_match(self, mock_pm, scheduler):
        """2 overrides, only 1 matching = returns 1."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "FF0000FF"}]}],
            }
        )

        overrides = [
            {"type": "PLA", "color": "#FF0000"},  # Matches
            {"type": "PETG", "color": "#00FF00"},  # Does not match
        ]
        result = scheduler._count_override_color_matches(1, overrides)
        assert result == 1

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_color_normalization(self, mock_pm, scheduler):
        """Override color '#FF0000' matches printer tray_color 'FF0000FF' (with alpha)."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "FF0000FF"}]}],
            }
        )

        # Override uses #-prefixed color; printer uses 8-char RGBA without hash
        result = scheduler._count_override_color_matches(1, [{"type": "PLA", "color": "#FF0000"}])
        assert result == 1

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_external_spool_match(self, mock_pm, scheduler):
        """Override matches filament in vt_tray."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [],
                "vt_tray": [{"tray_type": "TPU", "tray_color": "0000FFFF"}],
            }
        )

        result = scheduler._count_override_color_matches(1, [{"type": "TPU", "color": "#0000FF"}])
        assert result == 1


class TestFilamentOverrideInMatching:
    """Test that when overrides are applied to filament requirements, the matching uses overridden values."""

    @pytest.fixture
    def scheduler(self):
        return PrintScheduler()

    def _apply_overrides(self, filament_reqs, overrides):
        """Simulate override application as done in _compute_ams_mapping_for_printer."""
        override_map = {o["slot_id"]: o for o in overrides}
        for req in filament_reqs:
            if req["slot_id"] in override_map:
                override = override_map[req["slot_id"]]
                req["type"] = override["type"]
                req["color"] = override["color"]
                req["tray_info_idx"] = ""  # Clear for override
        return filament_reqs

    def test_override_changes_color_match(self, scheduler):
        """Original req has color A, loaded has color B. Override to color B gives exact match."""
        filament_reqs = [{"slot_id": 1, "type": "PLA", "color": "#000000", "tray_info_idx": ""}]
        loaded = [
            {"type": "PLA", "color": "#FF0000", "global_tray_id": 0},
        ]

        # Without override: type-only match (colors differ)
        result_without = scheduler._match_filaments_to_slots(filament_reqs, loaded)
        assert result_without == [0]  # Matches by type only

        # Now apply override changing color to match loaded
        overrides = [{"slot_id": 1, "type": "PLA", "color": "#FF0000"}]
        filament_reqs_overridden = [{"slot_id": 1, "type": "PLA", "color": "#000000", "tray_info_idx": ""}]
        self._apply_overrides(filament_reqs_overridden, overrides)

        result_with = scheduler._match_filaments_to_slots(filament_reqs_overridden, loaded)
        assert result_with == [0]  # Exact color match now
        # Verify the override actually changed the color in the requirement
        assert filament_reqs_overridden[0]["color"] == "#FF0000"

    def test_override_clears_tray_info_idx(self, scheduler):
        """When tray_info_idx is cleared, matching falls to color-based instead of tray_info_idx-based."""
        loaded = [
            {"type": "PLA", "color": "#FF0000", "global_tray_id": 0, "tray_info_idx": "GFA00"},
            {"type": "PLA", "color": "#00FF00", "global_tray_id": 1, "tray_info_idx": "GFB00"},
        ]

        # Without override: tray_info_idx "GFA00" matches tray 0 (red)
        filament_reqs_original = [{"slot_id": 1, "type": "PLA", "color": "#FF0000", "tray_info_idx": "GFA00"}]
        result_original = scheduler._match_filaments_to_slots(filament_reqs_original, loaded)
        assert result_original == [0]  # Matched by tray_info_idx

        # With override: tray_info_idx is cleared, color changed to green -> matches tray 1
        filament_reqs_overridden = [{"slot_id": 1, "type": "PLA", "color": "#FF0000", "tray_info_idx": "GFA00"}]
        overrides = [{"slot_id": 1, "type": "PLA", "color": "#00FF00"}]
        self._apply_overrides(filament_reqs_overridden, overrides)

        assert filament_reqs_overridden[0]["tray_info_idx"] == ""  # Cleared
        result_overridden = scheduler._match_filaments_to_slots(filament_reqs_overridden, loaded)
        assert result_overridden == [1]  # Now matches tray 1 by color

    def test_override_type_change(self, scheduler):
        """Override changes type from PLA to PETG, loaded has PETG -> matches."""
        loaded = [
            {"type": "PETG", "color": "#FF0000", "global_tray_id": 0},
        ]

        # Without override: PLA requirement, PETG loaded -> no match
        filament_reqs_original = [{"slot_id": 1, "type": "PLA", "color": "#FF0000", "tray_info_idx": ""}]
        result_original = scheduler._match_filaments_to_slots(filament_reqs_original, loaded)
        assert result_original == [-1]  # Type mismatch

        # With override: type changed to PETG -> matches
        filament_reqs_overridden = [{"slot_id": 1, "type": "PLA", "color": "#FF0000", "tray_info_idx": ""}]
        overrides = [{"slot_id": 1, "type": "PETG", "color": "#FF0000"}]
        self._apply_overrides(filament_reqs_overridden, overrides)

        result_overridden = scheduler._match_filaments_to_slots(filament_reqs_overridden, loaded)
        assert result_overridden == [0]  # Exact match now

    def test_partial_override(self, scheduler):
        """2 slots, only slot 1 overridden. Slot 1 uses override, slot 2 uses original."""
        loaded = [
            {"type": "PLA", "color": "#FF0000", "global_tray_id": 0},
            {"type": "PETG", "color": "#00FF00", "global_tray_id": 1},
        ]

        filament_reqs = [
            {"slot_id": 1, "type": "PLA", "color": "#000000", "tray_info_idx": "GFA00"},
            {"slot_id": 2, "type": "PETG", "color": "#00FF00", "tray_info_idx": "GFG02"},
        ]

        # Override only slot 1: change color to red
        overrides = [{"slot_id": 1, "type": "PLA", "color": "#FF0000"}]
        self._apply_overrides(filament_reqs, overrides)

        # Slot 1: overridden to PLA/#FF0000, tray_info_idx cleared -> matches tray 0 by exact color
        assert filament_reqs[0]["color"] == "#FF0000"
        assert filament_reqs[0]["tray_info_idx"] == ""

        # Slot 2: NOT overridden, retains original tray_info_idx
        assert filament_reqs[1]["color"] == "#00FF00"
        assert filament_reqs[1]["tray_info_idx"] == "GFG02"

        result = scheduler._match_filaments_to_slots(filament_reqs, loaded)
        assert result == [0, 1]  # Slot 1 -> tray 0 (red PLA), slot 2 -> tray 1 (green PETG)

    def test_nozzle_filtering_with_override(self, scheduler):
        """Override to a type only available on the wrong nozzle returns -1."""
        loaded = [
            # PETG on RIGHT nozzle (extruder 0) only
            {"type": "PETG", "color": "#FF0000", "global_tray_id": 0, "extruder_id": 0},
            # PLA on LEFT nozzle (extruder 1) only
            {"type": "PLA", "color": "#00FF00", "global_tray_id": 4, "extruder_id": 1},
        ]

        # Override to PETG on LEFT nozzle — but PETG is only on RIGHT
        filament_reqs = [{"slot_id": 1, "type": "PLA", "color": "#000000", "tray_info_idx": "GFA00", "nozzle_id": 1}]
        overrides = [{"slot_id": 1, "type": "PETG", "color": "#FF0000"}]
        self._apply_overrides(filament_reqs, overrides)

        result = scheduler._match_filaments_to_slots(filament_reqs, loaded)
        # Nozzle filter limits to extruder 1 (LEFT) which only has PLA.
        # Override changed type to PETG, so no type match on LEFT nozzle -> -1
        assert result == [-1]


class TestGetMissingForceColorSlots:
    """Test the _get_missing_force_color_slots method."""

    @pytest.fixture
    def scheduler(self):
        return PrintScheduler()

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_no_status_returns_all_slots(self, mock_pm, scheduler):
        """When printer has no status, all force-matched slots are reported missing."""
        mock_pm.get_status.return_value = None

        result = scheduler._get_missing_force_color_slots(
            1, [{"type": "PLA", "color": "#FF0000", "force_color_match": True}]
        )
        assert result == ["PLA (#FF0000)"]

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_exact_match_returns_empty(self, mock_pm, scheduler):
        """All force slots loaded on printer returns empty list."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "FF0000FF"}]}],
            }
        )

        result = scheduler._get_missing_force_color_slots(
            1, [{"type": "PLA", "color": "#FF0000", "force_color_match": True}]
        )
        assert result == []

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_partial_match_reports_missing(self, mock_pm, scheduler):
        """Only missing slots reported when one matches and one does not."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "FF0000FF"}]}],
            }
        )

        overrides = [
            {"type": "PLA", "color": "#FF0000", "force_color_match": True},
            {"type": "PETG", "color": "#00FF00", "force_color_match": True},
        ]
        result = scheduler._get_missing_force_color_slots(1, overrides)
        assert result == ["PETG (#00FF00)"]

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_external_spool_match(self, mock_pm, scheduler):
        """Force-matched slot satisfied by external spool (vt_tray)."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [],
                "vt_tray": [{"tray_type": "TPU", "tray_color": "0000FFFF"}],
            }
        )

        result = scheduler._get_missing_force_color_slots(
            1, [{"type": "TPU", "color": "#0000FF", "force_color_match": True}]
        )
        assert result == []

    @patch("backend.app.services.print_scheduler.printer_manager")
    def test_dual_nozzle_color_match(self, mock_pm, scheduler):
        """Force color match works across multiple AMS trays on dual-nozzle printer."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [
                    {
                        "id": 0,
                        "tray": [
                            {"id": 0, "tray_type": "PLA", "tray_color": "FF0000FF"},
                            {"id": 1, "tray_type": "PETG", "tray_color": "00FF00FF"},
                        ],
                    }
                ],
            }
        )

        overrides = [
            {"type": "PLA", "color": "#FF0000", "force_color_match": True},
            {"type": "PETG", "color": "#00FF00", "force_color_match": True},
        ]
        result = scheduler._get_missing_force_color_slots(1, overrides)
        assert result == []


class TestFindIdlePrinterForceColorMatch:
    """Integration tests for _find_idle_printer_for_model with force_color_match overrides."""

    @pytest.fixture
    def scheduler(self):
        return PrintScheduler()

    def _make_async_db(self, printers):
        """Build a minimal async-compatible DB mock that returns the given printers."""
        from unittest.mock import AsyncMock

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = printers

        mock_db = MagicMock()
        mock_db.execute = AsyncMock(return_value=mock_result)
        return mock_db

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_force_color_match_skips_printer_missing_color(self, mock_pm, scheduler):
        """Printer missing a force-matched color is skipped with descriptive waiting reason."""
        # Printer has red PLA but not green PLA
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "FF0000FF"}]}],
            }
        )
        mock_pm.is_connected.return_value = True

        scheduler._is_printer_idle = MagicMock(return_value=True)

        mock_printer = MagicMock()
        mock_printer.id = 1
        mock_printer.name = "Test Printer"
        mock_printer.model = "X1C"
        mock_printer.location = None

        mock_db = self._make_async_db([mock_printer])

        force_overrides = [{"type": "PLA", "color": "#00FF00", "force_color_match": True}]
        printer_id, reason = await scheduler._find_idle_printer_for_model(
            mock_db, "X1C", set(), filament_overrides=force_overrides
        )

        assert printer_id is None
        assert reason is not None
        assert "No matching material/color" in reason
        assert "PLA (#00FF00)" in reason

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_force_color_match_succeeds_when_color_loaded(self, mock_pm, scheduler):
        """Printer with all force-matched colors loaded is assigned immediately."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "00FF00FF"}]}],
            }
        )
        mock_pm.is_connected.return_value = True

        scheduler._is_printer_idle = MagicMock(return_value=True)

        mock_printer = MagicMock()
        mock_printer.id = 42
        mock_printer.name = "Green Printer"
        mock_printer.model = "X1C"
        mock_printer.location = None

        mock_db = self._make_async_db([mock_printer])

        force_overrides = [{"type": "PLA", "color": "#00FF00", "force_color_match": True}]
        printer_id, reason = await scheduler._find_idle_printer_for_model(
            mock_db, "X1C", set(), filament_overrides=force_overrides
        )

        assert printer_id == 42
        assert reason is None

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_legacy_overrides_without_force_flag_use_preference_ordering(self, mock_pm, scheduler):
        """Old overrides without force_color_match use existing 'at least one match' preference logic."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "FF0000FF"}]}],
            }
        )
        mock_pm.is_connected.return_value = True

        scheduler._is_printer_idle = MagicMock(return_value=True)

        mock_printer = MagicMock()
        mock_printer.id = 7
        mock_printer.name = "Legacy Printer"
        mock_printer.model = "P1S"
        mock_printer.location = None

        mock_db = self._make_async_db([mock_printer])

        # Only one of two overrides matches — no force_color_match flag (legacy data)
        legacy_overrides = [
            {"type": "PLA", "color": "#FF0000"},   # matches
            {"type": "PLA", "color": "#00FF00"},   # does not match
        ]
        printer_id, reason = await scheduler._find_idle_printer_for_model(
            mock_db, "P1S", set(), filament_overrides=legacy_overrides
        )

        # Should still be assigned because at least one color matched (legacy behaviour)
        assert printer_id == 7
        assert reason is None

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_no_filaments_loaded_includes_color_in_waiting_reason(self, mock_pm, scheduler):
        """Printer with no filaments generates waiting reason with color info for force_color_match."""
        # Printer has completely empty AMS and no external spool
        mock_pm.get_status.return_value = MagicMock(
            raw_data={"ams": [], "vt_tray": []}
        )
        mock_pm.is_connected.return_value = True

        scheduler._is_printer_idle = MagicMock(return_value=True)

        mock_printer = MagicMock()
        mock_printer.id = 1
        mock_printer.name = "Empty Printer"
        mock_printer.model = "X1C"
        mock_printer.location = None

        mock_db = self._make_async_db([mock_printer])

        force_overrides = [{"type": "PLA", "color": "#FF0000", "force_color_match": True}]
        required_types = ["PLA"]
        printer_id, reason = await scheduler._find_idle_printer_for_model(
            mock_db, "X1C", set(), required_filament_types=required_types, filament_overrides=force_overrides
        )

        assert printer_id is None
        assert reason is not None
        # Color info must appear in the message even though the printer failed the type check
        assert "No matching material/color" in reason
        assert "PLA (#FF0000)" in reason

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_no_filaments_not_shown_as_busy(self, mock_pm, scheduler):
        """Printer with no filaments is placed in 'missing filament' bucket, not 'busy' bucket."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={"ams": [], "vt_tray": []}
        )
        mock_pm.is_connected.return_value = True

        scheduler._is_printer_idle = MagicMock(return_value=True)

        mock_printer = MagicMock()
        mock_printer.id = 1
        mock_printer.name = "Empty Printer"
        mock_printer.model = "X1C"
        mock_printer.location = None

        mock_db = self._make_async_db([mock_printer])

        force_overrides = [{"type": "PLA", "color": "#FF0000", "force_color_match": True}]
        required_types = ["PLA"]
        printer_id, reason = await scheduler._find_idle_printer_for_model(
            mock_db, "X1C", set(), required_filament_types=required_types, filament_overrides=force_overrides
        )

        assert printer_id is None
        assert reason is not None
        # Should NOT appear as "Busy" — that label is reserved for printers running a print
        assert "Busy" not in reason

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_color_name_used_in_waiting_reason_when_provided(self, mock_pm, scheduler):
        """When color_name is in the override dict, the friendly name is shown instead of hex."""
        mock_pm.get_status.return_value = MagicMock(
            raw_data={"ams": [], "vt_tray": []}
        )
        mock_pm.is_connected.return_value = True

        scheduler._is_printer_idle = MagicMock(return_value=True)

        mock_printer = MagicMock()
        mock_printer.id = 1
        mock_printer.name = "Test Printer"
        mock_printer.model = "X1C"
        mock_printer.location = None

        mock_db = self._make_async_db([mock_printer])

        force_overrides = [{"type": "PLA", "color": "#FF0000", "color_name": "Red", "force_color_match": True}]
        printer_id, reason = await scheduler._find_idle_printer_for_model(
            mock_db, "X1C", set(), filament_overrides=force_overrides
        )

        assert printer_id is None
        assert reason is not None
        assert "No matching material/color" in reason
        # Friendly name "Red" should appear instead of hex "#FF0000"
        assert "PLA (Red)" in reason
        assert "#FF0000" not in reason

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_busy_not_shown_when_force_color_fails_alongside_busy_printer(self, mock_pm, scheduler):
        """When one printer is busy and another has wrong force-color, show only 'No matching' message."""
        from unittest.mock import AsyncMock

        # Printer 1 is busy (currently printing)
        # Printer 2 is idle but has wrong color
        def get_status_side_effect(printer_id):
            if printer_id == 2:
                return MagicMock(
                    raw_data={
                        "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "FF0000FF"}]}],
                    }
                )
            return None

        mock_pm.get_status.side_effect = get_status_side_effect
        mock_pm.is_connected.return_value = True

        def is_idle_side_effect(printer_id):
            return printer_id == 2  # Only printer 2 is idle

        scheduler._is_printer_idle = MagicMock(side_effect=is_idle_side_effect)

        mock_printer1 = MagicMock()
        mock_printer1.id = 1
        mock_printer1.name = "Busy Printer"
        mock_printer1.model = "X1C"
        mock_printer1.location = None

        mock_printer2 = MagicMock()
        mock_printer2.id = 2
        mock_printer2.name = "Wrong Color Printer"
        mock_printer2.model = "X1C"
        mock_printer2.location = None

        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_printer1, mock_printer2]
        mock_db = MagicMock()
        mock_db.execute = AsyncMock(return_value=mock_result)

        # Green PLA required but printer2 only has red PLA; printer1 is busy (printing)
        force_overrides = [{"type": "PLA", "color": "#00FF00", "color_name": "Green", "force_color_match": True}]
        printer_id, reason = await scheduler._find_idle_printer_for_model(
            mock_db, "X1C", set(), filament_overrides=force_overrides
        )

        assert printer_id is None
        assert reason is not None
        # "No matching material/color" takes precedence — "Busy" must NOT appear
        assert "No matching material/color" in reason
        assert "Busy" not in reason
        assert "Green" in reason

    @patch("backend.app.services.print_scheduler.printer_manager")
    @pytest.mark.asyncio
    async def test_new_job_gets_printer_when_previous_has_no_matching_color(self, mock_pm, scheduler):
        """New job (no force_color_match) can claim a printer even when a prior job is waiting for color match."""
        # Printer has green PLA loaded
        mock_pm.get_status.return_value = MagicMock(
            raw_data={
                "ams": [{"id": 0, "tray": [{"id": 0, "tray_type": "PLA", "tray_color": "00FF00FF"}]}],
            }
        )
        mock_pm.is_connected.return_value = True

        scheduler._is_printer_idle = MagicMock(return_value=True)

        mock_printer = MagicMock()
        mock_printer.id = 42
        mock_printer.name = "Green Printer"
        mock_printer.model = "X1C"
        mock_printer.location = None

        mock_db = self._make_async_db([mock_printer])

        # Simulate "no matching" job (needs red PLA but printer has green) — returns no printer
        force_overrides_red = [{"type": "PLA", "color": "#FF0000", "color_name": "Red", "force_color_match": True}]
        p1, r1 = await scheduler._find_idle_printer_for_model(
            mock_db, "X1C", set(), filament_overrides=force_overrides_red
        )
        assert p1 is None
        assert "No matching material/color" in r1

        # New job with no force_color_match — should get the printer (it "jumps" the waiting job)
        mock_db2 = self._make_async_db([mock_printer])
        p2, r2 = await scheduler._find_idle_printer_for_model(
            mock_db2, "X1C", set()  # no overrides
        )
        assert p2 == 42
        assert r2 is None
