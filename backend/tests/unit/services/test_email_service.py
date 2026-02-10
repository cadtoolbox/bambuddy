"""Unit tests for email service.

These tests verify email template rendering and HTML formatting.
"""

from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.notification_template import NotificationTemplate
from backend.app.services.email_service import (
    create_password_reset_email_from_template,
    create_welcome_email_from_template,
)


class TestEmailTemplateFormatting:
    """Tests for email template formatting."""

    @pytest.mark.asyncio
    async def test_welcome_email_newlines_converted_to_br(self):
        """Verify that newlines in welcome email body are converted to <br> tags."""
        # Mock database session
        db = AsyncMock(spec=AsyncSession)

        # Mock template with newlines
        template = NotificationTemplate(
            event_type="user_created",
            name="Welcome Email",
            title_template="Welcome to {app_name}",
            body_template="Hello {username}!\n\nYour password is: {password}\n\nPlease login at: {login_url}",
            is_default=True,
        )

        # Patch get_notification_template to return our template
        with patch("backend.app.services.email_service.get_notification_template", return_value=template):
            # Generate email
            subject, text_body, html_body = await create_welcome_email_from_template(
                db=db,
                username="testuser",
                password="testpass123",
                login_url="http://example.com/login",
                app_name="TestApp",
            )

        # Verify subject
        assert subject == "Welcome to TestApp"

        # Verify text body has newlines
        assert "\n\n" in text_body
        assert "Hello testuser!" in text_body
        assert "Your password is: testpass123" in text_body

        # Verify HTML body has <br> tags instead of relying on CSS
        assert "<br>" in html_body
        # Should not use white-space: pre-wrap
        assert "white-space: pre-wrap" not in html_body
        # Should have proper structure
        assert "<!DOCTYPE html>" in html_body
        assert '<div style="font-size: 16px;">' in html_body

        # Verify that escaped content is present (XSS protection)
        assert "Hello testuser!<br>" in html_body
        assert "Your password is: testpass123<br>" in html_body

    @pytest.mark.asyncio
    async def test_password_reset_email_newlines_converted_to_br(self):
        """Verify that newlines in password reset email body are converted to <br> tags."""
        # Mock database session
        db = AsyncMock(spec=AsyncSession)

        # Mock template with newlines
        template = NotificationTemplate(
            event_type="password_reset",
            name="Password Reset",
            title_template="{app_name} - Password Reset",
            body_template="Hello {username},\n\nYour password has been reset.\nNew password: {password}\n\nLogin at: {login_url}",
            is_default=True,
        )

        # Patch get_notification_template to return our template
        with patch("backend.app.services.email_service.get_notification_template", return_value=template):
            # Generate email
            subject, text_body, html_body = await create_password_reset_email_from_template(
                db=db,
                username="testuser",
                password="newpass456",
                login_url="http://example.com/login",
                app_name="TestApp",
            )

        # Verify subject
        assert subject == "TestApp - Password Reset"

        # Verify text body has newlines
        assert "\n\n" in text_body
        assert "Hello testuser," in text_body

        # Verify HTML body has <br> tags
        assert "<br>" in html_body
        # Should not use white-space: pre-wrap
        assert "white-space: pre-wrap" not in html_body
        # Should have security alert
        assert "Security Alert" in html_body

    @pytest.mark.asyncio
    async def test_email_header_padding(self):
        """Verify that email header has proper padding to prevent cutoff."""
        # Mock database session
        db = AsyncMock(spec=AsyncSession)

        # Mock template
        template = NotificationTemplate(
            event_type="user_created",
            name="Welcome Email",
            title_template="Welcome",
            body_template="Test body",
            is_default=True,
        )

        # Patch get_notification_template to return our template
        with patch("backend.app.services.email_service.get_notification_template", return_value=template):
            # Generate email
            subject, text_body, html_body = await create_welcome_email_from_template(
                db=db,
                username="testuser",
                password="testpass123",
                login_url="http://example.com/login",
            )

        # Verify header has 30px padding (not 20px which was cutting off)
        assert "padding: 30px; border-radius: 8px 8px 0 0;" in html_body

    @pytest.mark.asyncio
    async def test_email_xss_protection(self):
        """Verify that HTML escaping is applied to prevent XSS attacks."""
        # Mock database session
        db = AsyncMock(spec=AsyncSession)

        # Mock template with potential XSS content
        template = NotificationTemplate(
            event_type="user_created",
            name="Welcome Email",
            title_template="Welcome <script>alert('xss')</script>",
            body_template="Hello <script>alert('xss')</script>\nTest",
            is_default=True,
        )

        # Patch get_notification_template to return our template
        with patch("backend.app.services.email_service.get_notification_template", return_value=template):
            # Generate email
            subject, text_body, html_body = await create_welcome_email_from_template(
                db=db,
                username="testuser",
                password="testpass123",
                login_url="http://example.com/login",
            )

        # Verify that script tags are escaped
        assert "&lt;script&gt;" in html_body
        assert "<script>" not in html_body or html_body.count("<script>") == 0  # No unescaped script tags
