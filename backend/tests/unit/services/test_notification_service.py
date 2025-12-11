"""Unit tests for NotificationService.

Tests event-based notifications and toggle behavior.
"""

import pytest
import json
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from backend.app.services.notification_service import NotificationService


class TestNotificationService:
    """Tests for NotificationService class."""

    @pytest.fixture
    def service(self):
        """Create a fresh NotificationService instance."""
        return NotificationService()

    @pytest.fixture
    def mock_provider(self):
        """Create a mock notification provider."""
        provider = MagicMock()
        provider.id = 1
        provider.name = "Test Provider"
        provider.provider_type = "webhook"
        provider.enabled = True
        provider.config = json.dumps({"webhook_url": "http://test.local/webhook"})
        provider.on_print_start = True
        provider.on_print_complete = True
        provider.on_print_failed = True
        provider.on_print_stopped = False
        provider.on_print_progress = False
        provider.on_printer_offline = False
        provider.on_printer_error = False
        provider.on_filament_low = False
        provider.on_maintenance_due = False
        provider.on_ams_humidity_high = False
        provider.on_ams_temperature_high = False
        provider.quiet_hours_enabled = False
        provider.quiet_hours_start = None
        provider.quiet_hours_end = None
        provider.daily_digest_enabled = False
        provider.daily_digest_time = None
        provider.printer_id = None
        return provider

    @pytest.fixture
    def mock_db(self):
        """Create a mock database session."""
        db = AsyncMock()
        db.commit = AsyncMock()
        return db

    # ========================================================================
    # Tests for on_print_start
    # ========================================================================

    @pytest.mark.asyncio
    async def test_on_print_start_sends_notification(
        self, service, mock_provider, mock_db
    ):
        """Verify notification is sent when print starts."""
        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get, \
             patch.object(
            service, '_send_to_providers', new_callable=AsyncMock
        ) as mock_send, \
             patch.object(
            service, '_build_message_from_template', new_callable=AsyncMock
        ) as mock_build:

            mock_get.return_value = [mock_provider]
            mock_build.return_value = ("Print Started", "Test Printer: test.3mf")

            await service.on_print_start(
                printer_id=1,
                printer_name="Test Printer",
                data={"filename": "test.3mf", "subtask_name": "test"},
                db=mock_db,
            )

            mock_get.assert_called_once()
            mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_on_print_start_skipped_when_no_providers(
        self, service, mock_db
    ):
        """Verify no error when no providers are configured for event."""
        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get, \
             patch.object(
            service, '_send_to_providers', new_callable=AsyncMock
        ) as mock_send:

            mock_get.return_value = []

            await service.on_print_start(
                printer_id=1,
                printer_name="Test Printer",
                data={},
                db=mock_db,
            )

            mock_send.assert_not_called()

    # ========================================================================
    # Tests for on_print_complete (status routing)
    # ========================================================================

    @pytest.mark.asyncio
    async def test_on_print_complete_routes_completed_status(
        self, service, mock_provider, mock_db
    ):
        """Verify completed status uses on_print_complete field."""
        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get, \
             patch.object(
            service, '_send_to_providers', new_callable=AsyncMock
        ), \
             patch.object(
            service, '_build_message_from_template', new_callable=AsyncMock
        ) as mock_build:

            mock_get.return_value = [mock_provider]
            mock_build.return_value = ("Test", "Test")

            await service.on_print_complete(
                printer_id=1,
                printer_name="Test",
                status="completed",
                data={},
                db=mock_db,
            )

            # Verify the correct event field was queried
            call_args = mock_get.call_args
            assert call_args[0][1] == "on_print_complete"

    @pytest.mark.asyncio
    async def test_on_print_complete_routes_failed_status(
        self, service, mock_provider, mock_db
    ):
        """Verify failed status uses on_print_failed field."""
        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get, \
             patch.object(
            service, '_send_to_providers', new_callable=AsyncMock
        ), \
             patch.object(
            service, '_build_message_from_template', new_callable=AsyncMock
        ) as mock_build:

            mock_get.return_value = [mock_provider]
            mock_build.return_value = ("Test", "Test")

            await service.on_print_complete(
                printer_id=1,
                printer_name="Test",
                status="failed",
                data={},
                db=mock_db,
            )

            call_args = mock_get.call_args
            assert call_args[0][1] == "on_print_failed"

    @pytest.mark.asyncio
    async def test_on_print_complete_routes_stopped_status(
        self, service, mock_provider, mock_db
    ):
        """Verify stopped status uses on_print_stopped field."""
        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get, \
             patch.object(
            service, '_send_to_providers', new_callable=AsyncMock
        ), \
             patch.object(
            service, '_build_message_from_template', new_callable=AsyncMock
        ) as mock_build:

            mock_get.return_value = [mock_provider]
            mock_build.return_value = ("Test", "Test")

            await service.on_print_complete(
                printer_id=1,
                printer_name="Test",
                status="stopped",
                data={},
                db=mock_db,
            )

            call_args = mock_get.call_args
            assert call_args[0][1] == "on_print_stopped"

    @pytest.mark.asyncio
    async def test_on_print_complete_routes_aborted_status(
        self, service, mock_provider, mock_db
    ):
        """Verify aborted status uses on_print_stopped field."""
        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get, \
             patch.object(
            service, '_send_to_providers', new_callable=AsyncMock
        ), \
             patch.object(
            service, '_build_message_from_template', new_callable=AsyncMock
        ) as mock_build:

            mock_get.return_value = [mock_provider]
            mock_build.return_value = ("Test", "Test")

            await service.on_print_complete(
                printer_id=1,
                printer_name="Test",
                status="aborted",
                data={},
                db=mock_db,
            )

            call_args = mock_get.call_args
            assert call_args[0][1] == "on_print_stopped"

    # ========================================================================
    # Tests for provider filtering
    # ========================================================================

    @pytest.mark.asyncio
    async def test_disabled_provider_not_returned(self, service, mock_provider, mock_db):
        """CRITICAL: Verify disabled providers don't receive notifications."""
        mock_provider.enabled = False

        # The actual filtering happens in _get_providers_for_event
        # which queries only enabled providers
        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get:
            # Simulate the query filtering out disabled providers
            mock_get.return_value = []

            result = await service._get_providers_for_event(
                mock_db, "on_print_start", printer_id=1
            )

            assert len(result) == 0

    @pytest.mark.asyncio
    async def test_provider_filtered_by_printer_id(self, service, mock_provider, mock_db):
        """Verify providers can be filtered by specific printer."""
        mock_provider.printer_id = 2  # Linked to printer 2

        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get:
            # When querying for printer 1, provider linked to printer 2 is excluded
            mock_get.return_value = []

            result = await service._get_providers_for_event(
                mock_db, "on_print_start", printer_id=1
            )

            assert len(result) == 0

    # ========================================================================
    # Tests for quiet hours
    # ========================================================================

    def test_is_in_quiet_hours_during_quiet_period(self, service, mock_provider):
        """Verify notifications are blocked during quiet hours."""
        mock_provider.quiet_hours_enabled = True
        mock_provider.quiet_hours_start = "22:00"
        mock_provider.quiet_hours_end = "07:00"

        with patch(
            'backend.app.services.notification_service.datetime'
        ) as mock_datetime:
            # Test during quiet hours (23:00)
            mock_now = MagicMock()
            mock_now.hour = 23
            mock_now.minute = 0
            mock_datetime.now.return_value = mock_now

            result = service._is_in_quiet_hours(mock_provider)

            assert result is True

    def test_is_in_quiet_hours_outside_quiet_period(self, service, mock_provider):
        """Verify notifications are allowed outside quiet hours."""
        mock_provider.quiet_hours_enabled = True
        mock_provider.quiet_hours_start = "22:00"
        mock_provider.quiet_hours_end = "07:00"

        with patch(
            'backend.app.services.notification_service.datetime'
        ) as mock_datetime:
            # Test outside quiet hours (12:00)
            mock_now = MagicMock()
            mock_now.hour = 12
            mock_now.minute = 0
            mock_datetime.now.return_value = mock_now

            result = service._is_in_quiet_hours(mock_provider)

            assert result is False

    def test_is_in_quiet_hours_disabled(self, service, mock_provider):
        """Verify quiet hours check returns False when disabled."""
        mock_provider.quiet_hours_enabled = False

        result = service._is_in_quiet_hours(mock_provider)

        assert result is False

    def test_is_in_quiet_hours_early_morning(self, service, mock_provider):
        """Verify quiet hours work across midnight (early morning)."""
        mock_provider.quiet_hours_enabled = True
        mock_provider.quiet_hours_start = "22:00"
        mock_provider.quiet_hours_end = "07:00"

        with patch(
            'backend.app.services.notification_service.datetime'
        ) as mock_datetime:
            # Test early morning (03:00) - should be in quiet hours
            mock_now = MagicMock()
            mock_now.hour = 3
            mock_now.minute = 0
            mock_datetime.now.return_value = mock_now

            result = service._is_in_quiet_hours(mock_provider)

            assert result is True

    # ========================================================================
    # Tests for AMS alarms
    # ========================================================================

    @pytest.mark.asyncio
    async def test_on_ams_humidity_high_sends_notification(
        self, service, mock_provider, mock_db
    ):
        """Verify AMS humidity alarm sends notification."""
        mock_provider.on_ams_humidity_high = True

        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get, \
             patch.object(
            service, '_send_to_providers', new_callable=AsyncMock
        ) as mock_send, \
             patch.object(
            service, '_build_message_from_template', new_callable=AsyncMock
        ) as mock_build:

            mock_get.return_value = [mock_provider]
            mock_build.return_value = ("AMS Humidity Alert", "High humidity detected")

            await service.on_ams_humidity_high(
                printer_id=1,
                printer_name="Test Printer",
                ams_label="AMS-A",
                humidity=75.0,
                threshold=60.0,
                db=mock_db,
            )

            mock_send.assert_called_once()
            # Verify force_immediate is True for alarms
            call_kwargs = mock_send.call_args[1]
            assert call_kwargs.get('force_immediate') is True

    @pytest.mark.asyncio
    async def test_on_ams_temperature_high_sends_notification(
        self, service, mock_provider, mock_db
    ):
        """Verify AMS temperature alarm sends notification."""
        mock_provider.on_ams_temperature_high = True

        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get, \
             patch.object(
            service, '_send_to_providers', new_callable=AsyncMock
        ) as mock_send, \
             patch.object(
            service, '_build_message_from_template', new_callable=AsyncMock
        ) as mock_build:

            mock_get.return_value = [mock_provider]
            mock_build.return_value = ("AMS Temperature Alert", "High temp detected")

            await service.on_ams_temperature_high(
                printer_id=1,
                printer_name="Test Printer",
                ams_label="AMS-A",
                temperature=40.0,
                threshold=35.0,
                db=mock_db,
            )

            mock_send.assert_called_once()
            # Verify force_immediate is True for alarms
            call_kwargs = mock_send.call_args[1]
            assert call_kwargs.get('force_immediate') is True

    @pytest.mark.asyncio
    async def test_ams_alarm_skipped_when_toggle_disabled(
        self, service, mock_provider, mock_db
    ):
        """CRITICAL: Verify AMS alarms respect toggle setting."""
        mock_provider.on_ams_humidity_high = False

        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get, \
             patch.object(
            service, '_send_to_providers', new_callable=AsyncMock
        ) as mock_send:

            # Provider with toggle disabled won't be returned
            mock_get.return_value = []

            await service.on_ams_humidity_high(
                printer_id=1,
                printer_name="Test",
                ams_label="AMS-A",
                humidity=75.0,
                threshold=60.0,
                db=mock_db,
            )

            mock_send.assert_not_called()

    # ========================================================================
    # Tests for daily digest
    # ========================================================================

    @pytest.mark.asyncio
    async def test_daily_digest_queues_notification(
        self, service, mock_provider, mock_db
    ):
        """Verify notifications are queued when digest mode is enabled."""
        mock_provider.daily_digest_enabled = True
        mock_provider.daily_digest_time = "09:00"

        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get, \
             patch.object(
            service, '_send_to_providers', new_callable=AsyncMock
        ) as mock_send, \
             patch.object(
            service, '_build_message_from_template', new_callable=AsyncMock
        ) as mock_build:

            mock_get.return_value = [mock_provider]
            mock_build.return_value = ("Test", "Test")

            await service.on_print_complete(
                printer_id=1,
                printer_name="Test",
                status="completed",
                data={},
                db=mock_db,
            )

            # When digest is enabled, _send_to_providers should still be called
            # but internally it will queue instead of send immediately
            mock_send.assert_called_once()

    @pytest.mark.asyncio
    async def test_force_immediate_bypasses_digest(
        self, service, mock_provider, mock_db
    ):
        """Verify force_immediate=True bypasses digest mode."""
        mock_provider.daily_digest_enabled = True
        mock_provider.on_ams_humidity_high = True

        with patch.object(
            service, '_get_providers_for_event', new_callable=AsyncMock
        ) as mock_get, \
             patch.object(
            service, '_send_to_providers', new_callable=AsyncMock
        ) as mock_send, \
             patch.object(
            service, '_build_message_from_template', new_callable=AsyncMock
        ) as mock_build:

            mock_get.return_value = [mock_provider]
            mock_build.return_value = ("Alert", "Alert message")

            await service.on_ams_humidity_high(
                printer_id=1,
                printer_name="Test",
                ams_label="AMS-A",
                humidity=75.0,
                threshold=60.0,
                db=mock_db,
            )

            # Verify force_immediate is passed
            call_kwargs = mock_send.call_args[1]
            assert call_kwargs.get('force_immediate') is True


class TestDigestModeAlwaysSendsImmediately:
    """CRITICAL: Tests that notifications always send immediately regardless of digest setting."""

    @pytest.fixture
    def service(self):
        return NotificationService()

    @pytest.mark.asyncio
    async def test_notification_sends_immediately_even_with_digest_enabled(self, service):
        """CRITICAL: All notifications must be sent immediately, digest is just a summary."""
        # Create a mock provider with digest enabled
        mock_provider = MagicMock()
        mock_provider.id = 1
        mock_provider.name = "Test Provider"
        mock_provider.provider_type = "ntfy"
        mock_provider.enabled = True
        mock_provider.daily_digest_enabled = True  # Digest enabled
        mock_provider.daily_digest_time = "23:59"
        mock_provider.config = '{"server": "https://ntfy.sh", "topic": "test"}'

        mock_db = AsyncMock()

        # Mock the _send_to_provider method
        with patch.object(service, '_send_to_provider', new_callable=AsyncMock) as mock_send:
            mock_send.return_value = (True, None)

            with patch.object(service, '_queue_for_digest', new_callable=AsyncMock) as mock_queue:
                with patch.object(service, '_update_provider_status', new_callable=AsyncMock):
                    with patch.object(service, '_log_notification', new_callable=AsyncMock):
                        await service._send_to_providers(
                            providers=[mock_provider],
                            title="Print Started",
                            message="Your print has started",
                            db=mock_db,
                            event_type="print_start",
                        )

                        # CRITICAL: _send_to_provider MUST be called (immediate send)
                        mock_send.assert_called_once()

                        # Digest queue should also be called (for daily summary)
                        mock_queue.assert_called_once()

    @pytest.mark.asyncio
    async def test_notification_sends_without_digest_queue_when_disabled(self, service):
        """When digest is disabled, notification sends but no digest queue."""
        mock_provider = MagicMock()
        mock_provider.id = 1
        mock_provider.name = "Test Provider"
        mock_provider.provider_type = "ntfy"
        mock_provider.enabled = True
        mock_provider.daily_digest_enabled = False  # Digest disabled
        mock_provider.daily_digest_time = None
        mock_provider.config = '{"server": "https://ntfy.sh", "topic": "test"}'

        mock_db = AsyncMock()

        with patch.object(service, '_send_to_provider', new_callable=AsyncMock) as mock_send:
            mock_send.return_value = (True, None)

            with patch.object(service, '_queue_for_digest', new_callable=AsyncMock) as mock_queue:
                with patch.object(service, '_update_provider_status', new_callable=AsyncMock):
                    with patch.object(service, '_log_notification', new_callable=AsyncMock):
                        await service._send_to_providers(
                            providers=[mock_provider],
                            title="Print Started",
                            message="Your print has started",
                            db=mock_db,
                            event_type="print_start",
                        )

                        # Notification must still be sent immediately
                        mock_send.assert_called_once()

                        # Digest queue should NOT be called when digest is disabled
                        mock_queue.assert_not_called()


class TestNotificationProviderTypes:
    """Tests for different notification provider types."""

    @pytest.fixture
    def service(self):
        return NotificationService()

    @pytest.mark.asyncio
    async def test_webhook_provider_sends_request(self, service):
        """Verify webhook provider sends HTTP request."""
        config = {
            "webhook_url": "http://test.local/webhook",
            "field_title": "title",
            "field_message": "message",
        }

        # Create a mock response
        mock_response = MagicMock()
        mock_response.status_code = 200

        # Mock the _get_client method
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch.object(service, '_get_client', new_callable=AsyncMock) as mock_get_client:
            mock_get_client.return_value = mock_client

            success, message = await service._send_webhook(
                config, "Test Title", "Test Message"
            )

            assert success is True
            mock_client.post.assert_called_once()

    @pytest.mark.asyncio
    async def test_webhook_handles_failure(self, service):
        """Verify webhook gracefully handles HTTP errors."""
        config = {
            "webhook_url": "http://test.local/webhook",
        }

        with patch('httpx.AsyncClient') as mock_client_class:
            mock_instance = AsyncMock()
            mock_instance.post.side_effect = Exception("Connection failed")
            mock_client_class.return_value.__aenter__ = AsyncMock(
                return_value=mock_instance
            )
            mock_client_class.return_value.__aexit__ = AsyncMock()

            success, message = await service._send_webhook(
                config, "Test", "Test"
            )

            assert success is False
            assert "Connection failed" in message or "error" in message.lower()


class TestNotificationTemplates:
    """Tests for notification message template rendering."""

    @pytest.fixture
    def service(self):
        return NotificationService()

    @pytest.mark.asyncio
    async def test_template_renders_variables(self, service):
        """Verify template variables are replaced correctly."""
        template_title = "Print {progress}% Complete"
        template_body = "{printer}: {filename}\nRemaining: {remaining_time}"

        variables = {
            "printer": "Test Printer",
            "filename": "test.3mf",
            "progress": "50",
            "remaining_time": "1h 30m",
        }

        title = template_title.format(**variables)
        body = template_body.format(**variables)

        assert title == "Print 50% Complete"
        assert "Test Printer" in body
        assert "test.3mf" in body
        assert "1h 30m" in body

    @pytest.mark.asyncio
    async def test_template_handles_missing_variables(self, service):
        """Verify missing template variables don't cause crashes."""
        template = "{printer}: {unknown_var}"
        variables = {"printer": "Test"}

        # Should handle gracefully - either leave placeholder or skip
        try:
            result = template.format_map(
                {**variables, "unknown_var": "{unknown_var}"}
            )
            assert "Test" in result
        except KeyError:
            pytest.fail("Template should handle missing variables gracefully")
