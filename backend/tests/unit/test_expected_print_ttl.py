"""Unit tests for _expected_print_creators / _expected_prints TTL eviction.

Exercises _evict_stale_expected_prints() and register_expected_print() using
direct manipulation of the module-level dicts so no database or event-loop is
needed.  time.monotonic is patched in each test to simulate the passage of
time without waiting.
"""

from unittest.mock import patch

import pytest

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_state():
    """Return a snapshot of all four module-level dicts (shallow copies)."""
    import backend.app.main as m

    return (
        dict(m._expected_prints),
        dict(m._expected_print_creators),
        dict(m._expected_print_registered_at),
        dict(m._print_ams_mappings),
    )


def _clear_state():
    """Empty all four dicts to ensure test isolation."""
    import backend.app.main as m

    m._expected_prints.clear()
    m._expected_print_creators.clear()
    m._expected_print_registered_at.clear()
    m._print_ams_mappings.clear()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.unit
class TestRegisterExpectedPrint:
    """register_expected_print stores entries with timestamps."""

    def setup_method(self):
        _clear_state()

    def teardown_method(self):
        _clear_state()

    def test_registers_bare_filename(self):
        """Non-.3mf filename creates a single key."""
        import backend.app.main as m

        with patch("backend.app.main.time") as mock_time:
            mock_time.monotonic.return_value = 1000.0
            m.register_expected_print(1, "benchy.gcode", 42)

        assert m._expected_prints[(1, "benchy.gcode")] == 42
        assert m._expected_print_registered_at[(1, "benchy.gcode")] == 1000.0

    def test_registers_three_keys_for_3mf(self):
        """A .3mf filename produces three key variants."""
        import backend.app.main as m

        with patch("backend.app.main.time") as mock_time:
            mock_time.monotonic.return_value = 2000.0
            m.register_expected_print(2, "benchy.3mf", 99)

        expected_keys = {
            (2, "benchy.3mf"),
            (2, "benchy"),
            (2, "benchy.gcode"),
        }
        assert set(m._expected_prints.keys()) == expected_keys
        assert all(m._expected_prints[k] == 99 for k in expected_keys)
        assert all(m._expected_print_registered_at[k] == 2000.0 for k in expected_keys)

    def test_stores_ams_mapping(self):
        """ams_mapping is stored in _print_ams_mappings keyed by archive_id."""
        import backend.app.main as m

        with patch("backend.app.main.time") as mock_time:
            mock_time.monotonic.return_value = 3000.0
            m.register_expected_print(1, "test.3mf", 7, ams_mapping=[0, 1, 2])

        assert m._print_ams_mappings[7] == [0, 1, 2]

    def test_stores_created_by_id_for_3mf(self):
        """created_by_id is stored in _expected_print_creators for all key variants."""
        import backend.app.main as m

        with patch("backend.app.main.time") as mock_time:
            mock_time.monotonic.return_value = 4000.0
            m.register_expected_print(3, "part.3mf", 55, created_by_id=7)

        assert m._expected_print_creators[(3, "part.3mf")] == 7
        assert m._expected_print_creators[(3, "part")] == 7
        assert m._expected_print_creators[(3, "part.gcode")] == 7


@pytest.mark.unit
class TestEvictStaleExpectedPrints:
    """_evict_stale_expected_prints removes only entries older than the TTL."""

    def setup_method(self):
        _clear_state()

    def teardown_method(self):
        _clear_state()

    def test_evicts_entries_older_than_ttl(self):
        """Entries registered before the cutoff are removed."""
        import backend.app.main as m

        now = 10_000.0
        old_time = now - m._EXPECTED_PRINT_TTL_SECONDS - 1  # older than TTL

        m._expected_prints[(1, "old.3mf")] = 10
        m._expected_print_registered_at[(1, "old.3mf")] = old_time

        with patch("backend.app.main.time") as mock_time:
            mock_time.monotonic.return_value = now
            m._evict_stale_expected_prints()

        assert (1, "old.3mf") not in m._expected_prints
        assert (1, "old.3mf") not in m._expected_print_registered_at

    def test_keeps_entries_younger_than_ttl(self):
        """Entries registered within the TTL window are kept."""
        import backend.app.main as m

        now = 10_000.0
        recent_time = now - m._EXPECTED_PRINT_TTL_SECONDS + 60  # still within TTL

        m._expected_prints[(1, "new.3mf")] = 20
        m._expected_print_registered_at[(1, "new.3mf")] = recent_time

        with patch("backend.app.main.time") as mock_time:
            mock_time.monotonic.return_value = now
            m._evict_stale_expected_prints()

        assert (1, "new.3mf") in m._expected_prints
        assert m._expected_prints[(1, "new.3mf")] == 20

    def test_evicts_creator_entry_alongside_print_entry(self):
        """_expected_print_creators is cleaned up together with _expected_prints."""
        import backend.app.main as m

        now = 10_000.0
        old_time = now - m._EXPECTED_PRINT_TTL_SECONDS - 1

        m._expected_prints[(1, "thing.3mf")] = 30
        m._expected_print_creators[(1, "thing.3mf")] = 5
        m._expected_print_registered_at[(1, "thing.3mf")] = old_time

        with patch("backend.app.main.time") as mock_time:
            mock_time.monotonic.return_value = now
            m._evict_stale_expected_prints()

        assert (1, "thing.3mf") not in m._expected_print_creators

    def test_cleans_ams_mapping_when_all_variants_evicted(self):
        """_print_ams_mappings entry is removed when no live keys remain for that archive_id."""
        import backend.app.main as m

        now = 10_000.0
        old_time = now - m._EXPECTED_PRINT_TTL_SECONDS - 1

        # Register all three variants for one archive
        for suffix in ("benchy.3mf", "benchy", "benchy.gcode"):
            m._expected_prints[(1, suffix)] = 50
            m._expected_print_registered_at[(1, suffix)] = old_time
        m._print_ams_mappings[50] = [0, 1]

        with patch("backend.app.main.time") as mock_time:
            mock_time.monotonic.return_value = now
            m._evict_stale_expected_prints()

        assert 50 not in m._print_ams_mappings

    def test_preserves_ams_mapping_when_one_variant_still_live(self):
        """_print_ams_mappings entry is kept when at least one key for that archive_id survives."""
        import backend.app.main as m

        now = 10_000.0
        old_time = now - m._EXPECTED_PRINT_TTL_SECONDS - 1
        recent_time = now - 60  # well within TTL

        # Two old variants, one recent variant — all point to archive 60
        m._expected_prints[(1, "part.3mf")] = 60
        m._expected_print_registered_at[(1, "part.3mf")] = old_time

        m._expected_prints[(1, "part")] = 60
        m._expected_print_registered_at[(1, "part")] = recent_time  # still live

        m._print_ams_mappings[60] = [2, 3]

        with patch("backend.app.main.time") as mock_time:
            mock_time.monotonic.return_value = now
            m._evict_stale_expected_prints()

        # The recent variant survived, so ams_mapping must be kept
        assert 60 in m._print_ams_mappings

    def test_no_op_when_nothing_is_stale(self):
        """Eviction is a no-op when all entries are within the TTL."""
        import backend.app.main as m

        now = 10_000.0
        recent_time = now - 30  # very fresh

        m._expected_prints[(1, "fresh.3mf")] = 70
        m._expected_print_registered_at[(1, "fresh.3mf")] = recent_time

        with patch("backend.app.main.time") as mock_time:
            mock_time.monotonic.return_value = now
            m._evict_stale_expected_prints()

        assert (1, "fresh.3mf") in m._expected_prints

    def test_mixed_old_and_new_entries(self):
        """Only stale entries are evicted; fresh ones survive."""
        import backend.app.main as m

        now = 10_000.0
        old_time = now - m._EXPECTED_PRINT_TTL_SECONDS - 1
        recent_time = now - 300

        m._expected_prints[(1, "stale.3mf")] = 80
        m._expected_print_registered_at[(1, "stale.3mf")] = old_time

        m._expected_prints[(2, "fresh.3mf")] = 81
        m._expected_print_registered_at[(2, "fresh.3mf")] = recent_time

        with patch("backend.app.main.time") as mock_time:
            mock_time.monotonic.return_value = now
            m._evict_stale_expected_prints()

        assert (1, "stale.3mf") not in m._expected_prints
        assert (2, "fresh.3mf") in m._expected_prints
        assert m._expected_prints[(2, "fresh.3mf")] == 81
