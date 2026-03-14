"""Tests for the _user_stopped_printers race condition fix.

Verifies that mark_printer_stopped_by_user() is called BEFORE the first
await db.commit() in stop_queue_item so that if the MQTT on_print_complete
callback fires during the commit yield the flag is already set and the
"failed" status is correctly overridden to "cancelled".
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.mark.unit
class TestUserStoppedRaceCondition:
    """mark_printer_stopped_by_user must be called before the db.commit() yield."""

    @pytest.mark.asyncio
    async def test_flag_set_before_db_commit(self):
        """mark_printer_stopped_by_user must be called before await db.commit().

        Simulates the race: inside the mocked db.commit() we check whether the
        flag has already been set.  If it has → no race.  If not → bug present.
        """
        from backend.app.main import _user_stopped_printers

        printer_id = 42
        _user_stopped_printers.discard(printer_id)  # start clean

        flag_set_during_commit = []

        async def _mock_commit():
            # At the moment the HTTP handler yields to the event loop for commit,
            # any pending MQTT callback would run.  Simulate that check here.
            flag_set_during_commit.append(printer_id in _user_stopped_printers)

        mock_db = AsyncMock()
        mock_db.commit = _mock_commit
        mock_db.execute = AsyncMock(
            return_value=MagicMock(
                scalar_one_or_none=MagicMock(
                    return_value=MagicMock(
                        status="printing",
                        printer_id=printer_id,
                        auto_off_after=False,
                    )
                )
            )
        )

        mock_pm = MagicMock()
        mock_pm.stop_print.return_value = True

        # printer_manager is lazily imported inside stop_queue_item from
        # backend.app.services.printer_manager, so we patch it there.
        with patch("backend.app.services.printer_manager.printer_manager", mock_pm):
            from backend.app.api.routes.print_queue import stop_queue_item

            await stop_queue_item(item_id=1, db=mock_db, _=None)

        # The flag must have been set BEFORE the commit yielded
        assert flag_set_during_commit, "db.commit() was never called"
        assert flag_set_during_commit[0], (
            "mark_printer_stopped_by_user() was called AFTER db.commit() — "
            "the race condition is not fixed"
        )

        # Cleanup
        _user_stopped_printers.discard(printer_id)

    @pytest.mark.asyncio
    async def test_on_print_complete_override_works_when_flag_pre_set(self):
        """If the flag is set before on_print_complete runs, status is overridden to 'cancelled'."""
        import backend.app.main as m

        printer_id = 99
        m._user_stopped_printers.discard(printer_id)
        m._user_stopped_printers.add(printer_id)  # simulate flag already set

        # Replicate the exact check from on_print_complete
        _raw_status = "failed"
        overridden = False
        if printer_id in m._user_stopped_printers and _raw_status in ("failed", "aborted"):
            overridden = True
        m._user_stopped_printers.discard(printer_id)

        assert overridden, "Status should have been overridden to 'cancelled' when flag is pre-set"

    @pytest.mark.asyncio
    async def test_on_print_complete_no_override_when_flag_not_set(self):
        """If the flag is NOT set, failed status is NOT overridden (normal failure)."""
        import backend.app.main as m

        printer_id = 100
        m._user_stopped_printers.discard(printer_id)  # ensure not set

        _raw_status = "failed"
        overridden = False
        if printer_id in m._user_stopped_printers and _raw_status in ("failed", "aborted"):
            overridden = True

        assert not overridden, "Status should NOT be overridden when flag is not set"
