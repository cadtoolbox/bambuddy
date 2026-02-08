"""Email sending utilities for advanced authentication."""

from __future__ import annotations

import logging
import secrets
import smtplib
import string
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from backend.app.models.settings import Settings

logger = logging.getLogger(__name__)


def generate_secure_password(length: int = 16) -> str:
    """Generate a secure random password.
    
    Args:
        length: Length of the password (default: 16)
        
    Returns:
        A secure random password containing uppercase, lowercase, digits, and special characters
    """
    # Ensure minimum length for security
    if length < 12:
        length = 12
    
    # Define character sets
    uppercase = string.ascii_uppercase
    lowercase = string.ascii_lowercase
    digits = string.digits
    special = "!@#$%^&*"
    
    # Ensure at least one character from each set
    password = [
        secrets.choice(uppercase),
        secrets.choice(lowercase),
        secrets.choice(digits),
        secrets.choice(special),
    ]
    
    # Fill the rest with random characters from all sets
    all_chars = uppercase + lowercase + digits + special
    password.extend(secrets.choice(all_chars) for _ in range(length - 4))
    
    # Shuffle to avoid predictable patterns
    password_list = list(password)
    secrets.SystemRandom().shuffle(password_list)
    
    return "".join(password_list)


async def get_smtp_settings(db: AsyncSession) -> dict[str, str] | None:
    """Get SMTP settings from database.
    
    Returns:
        Dictionary with SMTP settings or None if not configured
    """
    try:
        smtp_keys = [
            "smtp_server",
            "smtp_port",
            "smtp_username", 
            "smtp_password",
            "smtp_from_address",
            "smtp_use_tls",
            "smtp_use_ssl",
        ]
        
        result = await db.execute(select(Settings).where(Settings.key.in_(smtp_keys)))
        settings_list = result.scalars().all()
        
        if not settings_list:
            return None
            
        settings_dict = {s.key: s.value for s in settings_list}
        
        # Check required settings
        required = ["smtp_server", "smtp_port", "smtp_from_address"]
        if not all(key in settings_dict for key in required):
            return None
            
        return settings_dict
    except Exception as e:
        logger.error("Failed to get SMTP settings: %s", e)
        return None


async def send_email(
    db: AsyncSession,
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> bool:
    """Send an email using configured SMTP settings.
    
    Args:
        db: Database session
        to_email: Recipient email address
        subject: Email subject
        body_text: Plain text body
        body_html: Optional HTML body
        
    Returns:
        True if email was sent successfully, False otherwise
    """
    smtp_settings = await get_smtp_settings(db)
    if not smtp_settings:
        logger.error("SMTP settings not configured")
        return False
    
    try:
        # Create message
        msg = MIMEMultipart("alternative")
        msg["From"] = smtp_settings["smtp_from_address"]
        msg["To"] = to_email
        msg["Subject"] = subject
        
        # Attach text part
        msg.attach(MIMEText(body_text, "plain"))
        
        # Attach HTML part if provided
        if body_html:
            msg.attach(MIMEText(body_html, "html"))
        
        # Send email
        smtp_port = int(smtp_settings["smtp_port"])
        use_ssl = smtp_settings.get("smtp_use_ssl", "false").lower() == "true"
        use_tls = smtp_settings.get("smtp_use_tls", "true").lower() == "true"
        
        if use_ssl:
            # Use SMTP_SSL for SSL connection
            with smtplib.SMTP_SSL(smtp_settings["smtp_server"], smtp_port, timeout=30) as server:
                if smtp_settings.get("smtp_username") and smtp_settings.get("smtp_password"):
                    server.login(smtp_settings["smtp_username"], smtp_settings["smtp_password"])
                server.send_message(msg)
        else:
            # Use regular SMTP, optionally with STARTTLS
            with smtplib.SMTP(smtp_settings["smtp_server"], smtp_port, timeout=30) as server:
                if use_tls:
                    server.starttls()
                if smtp_settings.get("smtp_username") and smtp_settings.get("smtp_password"):
                    server.login(smtp_settings["smtp_username"], smtp_settings["smtp_password"])
                server.send_message(msg)
        
        logger.info("Email sent successfully to %s", to_email)
        return True
        
    except Exception as e:
        logger.error("Failed to send email to %s: %s", to_email, e, exc_info=True)
        return False


async def send_new_user_email(
    db: AsyncSession,
    to_email: str,
    username: str,
    password: str,
    login_url: str,
) -> bool:
    """Send welcome email to new user with login credentials.
    
    Args:
        db: Database session
        to_email: User's email address
        username: User's username
        password: Auto-generated password
        login_url: URL to login page
        
    Returns:
        True if email was sent successfully, False otherwise
    """
    subject = "Welcome to Bambuddy - Your Account Has Been Created"
    
    body_text = f"""
Welcome to Bambuddy!

Your account has been created with the following credentials:

Username: {username}
Password: {password}

You can log in at: {login_url}

Please keep your credentials secure. You can change your password after logging in.

Best regards,
Bambuddy Team
"""
    
    body_html = f"""
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #00ae42; color: white; padding: 20px; text-align: center; }}
        .content {{ background-color: #f9f9f9; padding: 20px; margin: 20px 0; }}
        .credentials {{ background-color: white; padding: 15px; border-left: 4px solid #00ae42; }}
        .button {{ background-color: #00ae42; color: white; padding: 12px 24px; text-decoration: none; 
                   display: inline-block; border-radius: 4px; margin: 10px 0; }}
        .footer {{ text-align: center; color: #666; font-size: 12px; margin-top: 20px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Welcome to Bambuddy!</h1>
        </div>
        <div class="content">
            <p>Your account has been created successfully.</p>
            <div class="credentials">
                <p><strong>Username:</strong> {username}</p>
                <p><strong>Password:</strong> {password}</p>
            </div>
            <p>Please keep your credentials secure. You can change your password after logging in.</p>
            <p style="text-align: center;">
                <a href="{login_url}" class="button">Log In Now</a>
            </p>
        </div>
        <div class="footer">
            <p>This is an automated message from Bambuddy. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
"""
    
    return await send_email(db, to_email, subject, body_text, body_html)


async def send_password_reset_email(
    db: AsyncSession,
    to_email: str,
    username: str,
    new_password: str,
    login_url: str,
) -> bool:
    """Send password reset email to user.
    
    Args:
        db: Database session
        to_email: User's email address
        username: User's username
        new_password: New auto-generated password
        login_url: URL to login page
        
    Returns:
        True if email was sent successfully, False otherwise
    """
    subject = "Bambuddy - Password Reset"
    
    body_text = f"""
Hello {username},

Your password has been reset. Here are your new login credentials:

Username: {username}
New Password: {new_password}

You can log in at: {login_url}

Please keep your credentials secure. You can change your password after logging in.

If you did not request this password reset, please contact your administrator immediately.

Best regards,
Bambuddy Team
"""
    
    body_html = f"""
<html>
<head>
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #00ae42; color: white; padding: 20px; text-align: center; }}
        .content {{ background-color: #f9f9f9; padding: 20px; margin: 20px 0; }}
        .credentials {{ background-color: white; padding: 15px; border-left: 4px solid #00ae42; }}
        .button {{ background-color: #00ae42; color: white; padding: 12px 24px; text-decoration: none; 
                   display: inline-block; border-radius: 4px; margin: 10px 0; }}
        .warning {{ background-color: #fff3cd; padding: 10px; border-left: 4px solid #ffc107; margin: 10px 0; }}
        .footer {{ text-align: center; color: #666; font-size: 12px; margin-top: 20px; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Password Reset</h1>
        </div>
        <div class="content">
            <p>Hello {username},</p>
            <p>Your password has been reset. Here are your new login credentials:</p>
            <div class="credentials">
                <p><strong>Username:</strong> {username}</p>
                <p><strong>New Password:</strong> {new_password}</p>
            </div>
            <div class="warning">
                <p><strong>Security Notice:</strong> If you did not request this password reset, 
                   please contact your administrator immediately.</p>
            </div>
            <p>Please keep your credentials secure. You can change your password after logging in.</p>
            <p style="text-align: center;">
                <a href="{login_url}" class="button">Log In Now</a>
            </p>
        </div>
        <div class="footer">
            <p>This is an automated message from Bambuddy. Please do not reply to this email.</p>
        </div>
    </div>
</body>
</html>
"""
    
    return await send_email(db, to_email, subject, body_text, body_html)


async def test_smtp_connection(smtp_settings: dict[str, str]) -> tuple[bool, str]:
    """Test SMTP connection with provided settings.
    
    Args:
        smtp_settings: Dictionary with SMTP configuration
        
    Returns:
        Tuple of (success: bool, message: str)
    """
    try:
        smtp_port = int(smtp_settings["smtp_port"])
        use_ssl = smtp_settings.get("smtp_use_ssl", "false").lower() == "true"
        use_tls = smtp_settings.get("smtp_use_tls", "true").lower() == "true"
        
        if use_ssl:
            with smtplib.SMTP_SSL(smtp_settings["smtp_server"], smtp_port, timeout=30) as server:
                if smtp_settings.get("smtp_username") and smtp_settings.get("smtp_password"):
                    server.login(smtp_settings["smtp_username"], smtp_settings["smtp_password"])
                return True, "SMTP connection successful"
        else:
            with smtplib.SMTP(smtp_settings["smtp_server"], smtp_port, timeout=30) as server:
                if use_tls:
                    server.starttls()
                if smtp_settings.get("smtp_username") and smtp_settings.get("smtp_password"):
                    server.login(smtp_settings["smtp_username"], smtp_settings["smtp_password"])
                return True, "SMTP connection successful"
                
    except smtplib.SMTPAuthenticationError as e:
        return False, f"Authentication failed: {e}"
    except smtplib.SMTPConnectError as e:
        return False, f"Connection failed: {e}"
    except Exception as e:
        return False, f"SMTP test failed: {e}"
