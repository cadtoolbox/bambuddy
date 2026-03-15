"""Tests for _user_stopped_printers set lifecycle.

Verifies that:
  - mark_printer_stopped_by_user() adds a printer ID to the set.
  - on_print_complete overrides "failed"/"aborted" -> "cancelled" when the printer
    is in _user_stopped_printers.
  - The printer ID is *always* discarded from the set after the status-override
    check, regardless of which branch is taken (fix for the "never cleared" bug).

These are pure-logic tests that directly simulate the in-module set and override
snippet behaviour, without importing the full main module (which requires FastAPI
and other heavy dependencies).  This matches the pattern used in
test_phantom_print_hardening.py.
"""


def _make_set() -> set:
    """Return a fresh set simulating _user_stopped_printers."""
    return set()


def _mark_stopped(user_stopped: set, printer_id: int) -> None:
    """Simulate mark_printer_stopped_by_user()."""
    user_stopped.add(printer_id)


def _run_override_snippet(user_stopped: set, printer_id: int, raw_status: str) -> str:
    """Reproduce the status-override block from on_print_complete.

    Mirrors the exact code in backend/app/main.py::on_print_complete:

        if printer_id in _user_stopped_printers and _raw_status in ("failed", "aborted"):
            data = {**data, "status": "cancelled"}
        _user_stopped_printers.discard(printer_id)
    """
    data = {"status": raw_status}
    if printer_id in user_stopped and raw_status in ("failed", "aborted"):
        data = {**data, "status": "cancelled"}
    user_stopped.discard(printer_id)
    return data["status"]


class TestMarkPrinterStoppedByUser:
    """mark_printer_stopped_by_user populates the tracking set."""

    def test_adds_printer_id_to_set(self):
        s = _make_set()
        _mark_stopped(s, 42)
        assert 42 in s

    def test_multiple_printers_can_be_tracked(self):
        s = _make_set()
        _mark_stopped(s, 1)
        _mark_stopped(s, 2)
        assert 1 in s
        assert 2 in s

    def test_duplicate_add_is_idempotent(self):
        s = _make_set()
        _mark_stopped(s, 7)
        _mark_stopped(s, 7)
        assert len(s) == 1


class TestUserStoppedPrintersStatusOverride:
    """The status-override logic in on_print_complete.

    Tests that failed/aborted is mapped to cancelled when the printer was
    stopped by the user, and that the set is always cleared afterwards.
    """

    # --- status override cases ---

    def test_failed_status_overridden_to_cancelled_when_user_stopped(self):
        s = _make_set()
        _mark_stopped(s, 1)
        assert _run_override_snippet(s, 1, "failed") == "cancelled"

    def test_aborted_status_overridden_to_cancelled_when_user_stopped(self):
        s = _make_set()
        _mark_stopped(s, 1)
        assert _run_override_snippet(s, 1, "aborted") == "cancelled"

    def test_completed_status_not_overridden_even_when_user_stopped(self):
        s = _make_set()
        _mark_stopped(s, 1)
        assert _run_override_snippet(s, 1, "completed") == "completed"

    def test_failed_status_not_overridden_when_printer_not_in_set(self):
        s = _make_set()
        assert _run_override_snippet(s, 99, "failed") == "failed"

    # --- set-cleared cases (the core of the bug fix) ---

    def test_printer_id_cleared_after_override_branch_taken(self):
        """Printer is removed from set when status IS overridden."""
        s = _make_set()
        _mark_stopped(s, 5)
        _run_override_snippet(s, 5, "failed")
        assert 5 not in s

    def test_printer_id_cleared_after_non_override_status(self):
        """Printer is removed from set even when status is NOT overridden (completed)."""
        s = _make_set()
        _mark_stopped(s, 5)
        _run_override_snippet(s, 5, "completed")
        assert 5 not in s

    def test_printer_id_cleared_when_not_previously_in_set(self):
        """discard() on a printer never added is a no-op (no KeyError)."""
        s = _make_set()
        # Should not raise
        _run_override_snippet(s, 99, "failed")
        assert 99 not in s

    def test_other_printer_ids_not_affected_by_discard(self):
        """Only the completing printer's ID is removed; others stay."""
        s = _make_set()
        _mark_stopped(s, 1)
        _mark_stopped(s, 2)
        _run_override_snippet(s, 1, "failed")
        assert 1 not in s
        assert 2 in s

    def test_subsequent_failure_not_misclassified_as_cancelled(self):
        """After a user-stopped print completes, a later genuine failure is not overridden.

        This is the exact misclassification described in the issue: once a user stops
        a print the printer ID was left in the set, so any subsequent genuine failure
        would be wrongly reported as 'cancelled'.
        """
        s = _make_set()
        # First print: user explicitly stopped it
        _mark_stopped(s, 3)
        first_result = _run_override_snippet(s, 3, "failed")
        assert first_result == "cancelled"  # correct: user stopped it

        # Second print: genuine hardware failure, no user action
        second_result = _run_override_snippet(s, 3, "failed")
        assert second_result == "failed"  # must NOT be 'cancelled'
