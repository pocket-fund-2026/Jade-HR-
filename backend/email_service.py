"""
JADE HR outbound email — leave-request notifications.

Sends via the Resend HTTP API (https://resend.com) as tina@jadecouture.com.
The jadecouture.com domain is already verified in Resend (DKIM + SPF both
verified as of 2026-07-13) — Google Workspace's admin policy blocks SMTP
App Passwords for this mailbox, so we go through Resend's API instead of
raw SMTP against smtp.gmail.com.

Configured via env vars:
  RESEND_API_KEY   — required; Resend API key (starts with "re_")
  EMAIL_FROM       — optional; defaults to tina@jadecouture.com
  HR_NOTIFY_EMAIL  — optional; defaults to nimit.b@jadecouture.com

Not configured -> is_configured() is False -> every send function no-ops
(logs and returns) rather than raising, so the leave workflow itself never
breaks because email isn't set up.

Uses stdlib urllib only (no new dependency on requests/httpx) — a plain
HTTPS POST to https://api.resend.com/emails.
"""

import json
import logging
import os
import urllib.error
import urllib.request

logger = logging.getLogger("jade_hr.email")

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
RESEND_API_URL = "https://api.resend.com/emails"
EMAIL_FROM = os.environ.get("EMAIL_FROM", "tina@jadecouture.com")
# HR notify recipient — nimit.b@jadecouture.com (Head-HR) by default, since
# no one currently holds the hr console role in production; override via env
# once/if that changes.
HR_NOTIFY_EMAIL = os.environ.get("HR_NOTIFY_EMAIL", "nimit.b@jadecouture.com")


def is_configured() -> bool:
    return bool(RESEND_API_KEY)


def send_email(to: str, subject: str, body: str) -> bool:
    if not to:
        return False
    if not is_configured():
        logger.info("Email not configured — skipping send to %s: %s", to, subject)
        return False

    payload = {
        "from": f"Tina at JADE HR <{EMAIL_FROM}>",
        "to": [to],
        "subject": subject,
        "text": body,
    }
    req = urllib.request.Request(
        RESEND_API_URL,
        data=json.dumps(payload).encode(),
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
        return True
    except urllib.error.HTTPError as e:
        logger.error("Resend send to %s failed: HTTP %s %s", to, e.code, e.read().decode(errors="replace"))
        return False
    except Exception:
        logger.exception("Failed to send email to %s", to)
        return False


def notify_leave_submitted(
    employee_name: str, leave_type: str, start_date: str, end_date: str, reason: str,
    approver_emails: set[str], hr_email: str,
) -> None:
    """approver_emails may hold both the employee's Leave Approver and their
    Reporting To manager (if different people) — both get notified."""
    subject = f"Leave request from {employee_name} ({start_date} to {end_date})"
    body = (
        f"{employee_name} has submitted a {leave_type} leave request for {start_date} to {end_date}.\n\n"
        f"Reason: {reason}\n\n"
        f"Review it in the JADE HR console: https://jade-hr.vercel.app/employee\n"
    )
    for recipient in {*approver_emails, hr_email}:
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


def notify_absence_submitted(
    employee_name: str, department: str, start_date: str, end_date: str,
    number_of_days: float, details: str, approver_email: str, hr_email: str,
) -> None:
    subject = f"Work absence request from {employee_name} ({start_date} to {end_date})"
    body = (
        f"{employee_name} ({department}) has submitted a work-related absence request for "
        f"{start_date} to {end_date} ({number_of_days} day{'s' if number_of_days != 1 else ''}).\n\n"
        f"Details: {details}\n\n"
        f"Review it in the JADE HR console: https://jade-hr.vercel.app/admin/work-absence\n"
    )
    for recipient in {approver_email, hr_email}:
        if recipient:
            send_email(recipient, subject, body)


def notify_absence_resolved(
    employee_email: str, employee_name: str, status: str, start_date: str, end_date: str, admin_note: str,
) -> None:
    if not employee_email:
        return
    subject = f"Your work absence request has been {status}"
    body = (
        f"Hi {employee_name},\n\n"
        f"Your work-related absence request for {start_date} to {end_date} has been {status}.\n"
        + (f"\nNote: {admin_note}\n" if admin_note else "")
    )
    send_email(employee_email, subject, body)
