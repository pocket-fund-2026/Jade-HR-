"""
JADE HR outbound email — leave-request notifications.

Configured via env vars (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD,
EMAIL_FROM). Not yet configured in production as of this writing — every
send function checks is_configured() first and no-ops (logs and returns)
rather than raising, so the leave workflow itself never breaks because
email isn't set up yet.
"""

import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger("jade_hr.email")

SMTP_HOST = os.environ.get("SMTP_HOST", "")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")
EMAIL_FROM = os.environ.get("EMAIL_FROM", "tina@jadecouture.com")
# HR notify recipient — nimit.b@jadecouture.com (Head-HR) by default, since
# no one currently holds the hr console role in production; override via env
# once/if that changes.
HR_NOTIFY_EMAIL = os.environ.get("HR_NOTIFY_EMAIL", "nimit.b@jadecouture.com")


def is_configured() -> bool:
    return bool(SMTP_HOST and SMTP_USER and SMTP_PASSWORD)


def send_email(to: str, subject: str, body: str) -> bool:
    if not to:
        return False
    if not is_configured():
        logger.info("Email not configured — skipping send to %s: %s", to, subject)
        return False

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = EMAIL_FROM
    msg["To"] = to
    msg.set_content(body)

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


def notify_leave_submitted(employee_name: str, leave_type: str, start_date: str, end_date: str, reason: str, approver_email: str, hr_email: str) -> None:
    subject = f"Leave request from {employee_name} ({start_date} to {end_date})"
    body = (
        f"{employee_name} has submitted a {leave_type} leave request for {start_date} to {end_date}.\n\n"
        f"Reason: {reason}\n\n"
        f"Review it in the JADE HR console: https://jade-hr.vercel.app/employee\n"
    )
    for recipient in {approver_email, hr_email}:
        if recipient:
            send_email(recipient, subject, body)


def notify_leave_approved(employee_email: str, employee_name: str, leave_type: str, start_date: str, end_date: str) -> None:
    if not employee_email:
        return
    subject = "Your leave request has been approved"
    body = (
        f"Hi {employee_name},\n\n"
        f"Your {leave_type} leave request for {start_date} to {end_date} has been approved.\n"
    )
    send_email(employee_email, subject, body)
