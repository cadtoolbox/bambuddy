"""Tests for _dispatch_user_print_email helper (Problem 6 - deduplication).

Verifies that the helper correctly maps every recognised print status to the
right ``event_type`` and passes it to ``notification_service.send_user_print_email``,
and that it silently returns for ``None`` creator IDs or unknown statuses.
"""

from unittest.mock import AsyncMock, patch

import pytest


@pytest.mark.unit
class TestDispatchUserPrintEmail:
    """_dispatch_user_print_email maps print status → event_type correctly."""

    async def _call(self, status: str, created_by_id=1, mock_send=None):
        from backend.app.main import _dispatch_user_print_email

        if mock_send is None:
            mock_send = AsyncMock()
        with patch(
            "backend.app.main.notification_service.send_user_print_email",
            mock_send,
        ):
            await _dispatch_user_print_email(
                status=status,
                created_by_id=created_by_id,
                printer_name="TestPrinter",
                filename="model.3mf",
                db=object(),  # db is just passed through; not called by the helper itself
            )
        return mock_send

    @pytest.mark.asyncio
    async def test_completed_maps_to_user_print_complete(self):
        mock_send = await self._call("completed")
        mock_send.assert_awaited_once()
        assert mock_send.call_args.kwargs["event_type"] == "user_print_complete"

    @pytest.mark.asyncio
    async def test_failed_maps_to_user_print_failed(self):
        mock_send = await self._call("failed")
        mock_send.assert_awaited_once()
        assert mock_send.call_args.kwargs["event_type"] == "user_print_failed"

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status", ["stopped", "aborted", "cancelled"])
    async def test_stop_statuses_map_to_user_print_stopped(self, status):
        mock_send = await self._call(status)
        mock_send.assert_awaited_once()
        assert mock_send.call_args.kwargs["event_type"] == "user_print_stopped"

    @pytest.mark.asyncio
    async def test_none_created_by_id_returns_without_sending(self):
        mock_send = await self._call("completed", created_by_id=None)
        mock_send.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_unknown_status_returns_without_sending(self):
        mock_send = await self._call("running")
        mock_send.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_passes_correct_arguments(self):
        mock_send = AsyncMock()
        from backend.app.main import _dispatch_user_print_email

        db_stub = object()
        with patch(
            "backend.app.main.notification_service.send_user_print_email",
            mock_send,
        ):
            await _dispatch_user_print_email(
                status="completed",
                created_by_id=42,
                printer_name="MyPrinter",
                filename="cool_model.3mf",
                db=db_stub,
            )
        mock_send.assert_awaited_once_with(
            event_type="user_print_complete",
            created_by_id=42,
            printer_name="MyPrinter",
            filename="cool_model.3mf",
            db=db_stub,
        )
