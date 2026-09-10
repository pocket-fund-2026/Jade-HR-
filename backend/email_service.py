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
    ok, _ = send_email_detailed(to, subject, body)
    return ok


def send_email_detailed(to: str, subject: str, body: str) -> tuple[bool, str | None]:
    """Same as send_email, but also returns a short failure reason
    ("no_recipient" | "not_configured" | "http_<code>" | "exception:<msg>" |
    None on success) — callers that need to surface *why* a send didn't go
    through (e.g. the late-digest endpoint, which was silently returning
    emailed=False in production for weeks with `logger.error`/`.info` never
    showing up anywhere reachable) should use this instead of send_email."""
    if not to:
        return False, "no_recipient"
    if not is_configured():
        logger.info("Email not configured — skipping send to %s: %s", to, subject)
        return False, "not_configured"

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
            # Resend's edge sits behind Cloudflare, which blocks the default
            # "Python-urllib/x.y" User-Agent as a bot signature (Cloudflare
            # error 1010) — every send silently 403'd until this was added.
            "User-Agent": "JADE-HR/1.0 (+https://jade-hr.vercel.app)",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp.read()
        return True, None
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        logger.error("Resend send to %s failed: HTTP %s %s", to, e.code, detail)
        return False, f"http_{e.code}:{detail[:200]}"
    except Exception as e:
        logger.exception("Failed to send email to %s", to)
        return False, f"exception:{e}"


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


def notify_late_digest(
    date_iso: str, late_employees: list[dict], hr_email: str, extra_recipients: list[str] | None = None,
    include_report_link: bool = True,
) -> tuple[bool, str | None]:
    """One daily digest email listing everyone who clocked in late on
    date_iso. Called once per recipient group by routers/payroll.py's
    late_digest endpoint: once for HR with the full company-wide list
    (`hr_email`), and once per reporting manager with only their own
    reportees' entries (see _reporting_manager_emails) — managers get
    include_report_link=False since the linked report is an HR-admin page
    they may not have (or need) access to. `late_employees` is a list of
    {name, employee_code, location, time} dicts (time already IST-formatted
    by the caller). Sends nothing — and returns (False, "empty_list"/
    "no_recipient") — when the list is empty or there's no recipient at all,
    so nobody gets an empty "0 late today" email. Duplicate recipients (e.g.
    a manager who is also the HR contact) are only emailed once."""
    recipients = list(dict.fromkeys(r for r in [hr_email, *(extra_recipients or [])] if r))
    if not recipients:
        return False, "no_recipient"
    if not late_employees:
        return False, "empty_list"
    n = len(late_employees)
    lines = [
        f"{n} employee{'s' if n != 1 else ''} clocked in late on {date_iso}:",
        "",
    ]
    for e in late_employees:
        location = f" — {e['location']}" if e.get("location") else ""
        lines.append(f"  • {e.get('name', '')} ({e.get('employee_code', '')}){location}: in at {e.get('time', '—')}")
    lines += [
        "",
        "On-time cutoff is 10:00 AM for the standard shift (later for a later time slot), with the Daily "
        "Tolerance/Extended Buffer bands through 10:20 AM carrying no deduction — extended further to 11 AM / "
        "noon if they stayed back late the previous evening.",
    ]
    if include_report_link:
        lines.append("Full attendance sheet: https://jade-hr.vercel.app/admin/reports/attendance")
    subject = f"Late arrivals — {date_iso} ({n})"
    body = "\n".join(lines)
    sent_ok = False
    last_error: str | None = None
    for recipient in recipients:
        ok, err = send_email_detailed(recipient, subject, body)
        sent_ok = sent_ok or ok
        if err:
            last_error = err
    return sent_ok, (None if sent_ok else last_error)


_CLOCK_SECTION_LABELS = {
    "aip": ("Active AIPs", lambda r: f"AIP ends {r['end_date']}"),
    "probation": ("Probation Ending", lambda r: f"probation completes {r['probation_completion_date']}"),
    "notice": ("On Notice", lambda r: f"exits {r['scheduled_exit_date']}"),
}


def _days_label(days: int) -> str:
    if days < 0:
        return f"{abs(days)}d overdue"
    if days == 0:
        return "today"
    if days == 1:
        return "tomorrow"
    return f"in {days}d"


def notify_clocks_digest(
    date_iso: str, sections: dict[str, list[dict]], recipient: str, include_report_link: bool = True,
) -> tuple[bool, str | None]:
    """Digest email for AIP/Probation/Notice clocks that have entered the
    red/amber urgency zone (see routers.clocks.clocks_digest) — the same
    HR-plus-per-manager split as notify_late_digest above. `sections` is
    {"aip": [...], "probation": [...], "notice": [...]}, each row carrying
    name/employee_code/location/days_remaining plus its own date field.
    Sends nothing — (False, "empty_list"/"no_recipient") — when every section
    is empty or there's no recipient, so nobody gets a "nothing due" email."""
    if not recipient:
        return False, "no_recipient"
    total = sum(len(rows) for rows in sections.values())
    if total == 0:
        return False, "empty_list"
    lines = [f"{total} HR clock{'s' if total != 1 else ''} due soon or overdue as of {date_iso}:", ""]
    for key, (title, detail) in _CLOCK_SECTION_LABELS.items():
        rows = sections.get(key) or []
        if not rows:
            continue
        lines.append(f"{title} ({len(rows)}):")
        for r in rows:
            location = f" — {r['location']}" if r.get("location") else ""
            lines.append(
                f"  • {r.get('name', '')} ({r.get('employee_code', '')}){location}: "
                f"{detail(r)} ({_days_label(r['days_remaining'])})"
            )
        lines.append("")
    if include_report_link:
        lines.append("Full view: https://jade-hr.vercel.app/admin/dashboard")
    subject = f"HR clocks due — {date_iso} ({total})"
    return send_email_detailed(recipient, subject, "\n".join(lines).rstrip())


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


def notify_onboarding_submitted(submission: dict, hr_email: str) -> None:
    if not hr_email:
        return
    full_name = submission.get("full_name") or "Someone"
    subject = f"New onboarding submission — {full_name}"

    docs = []
    if submission.get("aadhar_front_path"):
        docs.append("Aadhar (front)")
    if submission.get("aadhar_back_path"):
        docs.append("Aadhar (back)")
    if submission.get("pan_card_path"):
        docs.append("PAN card")
    slip_count = len(submission.get("salary_slip_paths") or [])
    if slip_count:
        docs.append(f"{slip_count} salary slip{'s' if slip_count != 1 else ''}")

    lines = [
        f"{full_name} has submitted the new-joinee details form. Full details below:",
        "",
        "Personal Details",
        f"  Full Name: {submission.get('full_name', '')}",
        f"  Date of Birth: {submission.get('date_of_birth') or ''}",
        f"  Mobile: {submission.get('mobile', '')}",
        f"  Emergency Contact No: {submission.get('emergency_contact_no', '')}",
        f"  Email: {submission.get('email', '')}",
        "",
        "Permanent Address",
        f"  {submission.get('address_line1', '')}",
        f"  {submission.get('address_line2', '')}",
        f"  {submission.get('address_line3', '')}",
        f"  {submission.get('address_line4', '')}",
        "",
        "Employment Details",
        f"  Date of Joining: {submission.get('date_of_joining') or ''}",
        f"  Fresher: {'Yes' if submission.get('is_fresher') else 'No'}",
        "",
        "Bank Account Information",
        f"  Bank Name and Branch: {submission.get('bank_name', '')}",
        f"  Bank Account No: {submission.get('bank_account_no', '')}",
        f"  Bank IFSC Code: {submission.get('bank_ifsc', '')}",
        "",
        "Document Upload",
        f"  Aadhar Card No: {submission.get('aadhar_no', '')}",
        f"  PAN Card No: {submission.get('pan_no', '')}",
        f"  Documents attached: {', '.join(docs) if docs else 'None'}",
        f"  Date of Offer Letter: {submission.get('date_of_offer_letter') or ''}",
        "",
        "Job Designation",
        f"  Designation: {submission.get('designation', '')}",
        f"  Department: {submission.get('department', '')}",
        f"  KRA in Detail: {submission.get('kra', '')}",
        f"  Requires Personal Email: {'Yes' if submission.get('requires_personal_email') else 'No'}",
        f"  Requires Independent OMS Login: {'Yes' if submission.get('requires_oms_login') else 'No'}",
        "",
        "Workplace & Schedule",
        f"  Place of Work: {submission.get('place_of_work', '')}",
        f"  Timings + Days: {submission.get('timings_and_days', '')}",
        "",
        "Review it in the JADE HR console: https://jade-hr.vercel.app/admin/onboarding",
    ]
    send_email(hr_email, subject, "\n".join(lines))


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


def notify_loan_submitted(employee_name: str, department: str, amount: float, reason: str, hr_email: str) -> None:
    if not hr_email:
        return
    subject = f"Loan request from {employee_name} (₹{amount:,.0f})"
    body = (
        f"{employee_name} ({department}) has requested a loan/salary advance of ₹{amount:,.0f}.\n\n"
        f"Reason: {reason}\n\n"
        f"Review it in the JADE HR console: https://jade-hr.vercel.app/admin/loans\n"
    )
    send_email(hr_email, subject, body)


def notify_loan_resolved(
    employee_email: str, employee_name: str, status: str, amount: float, admin_note: str,
) -> None:
    if not employee_email:
        return
    subject = f"Your loan request has been {status}"
    body = (
        f"Hi {employee_name},\n\n"
        f"Your loan/salary advance request for ₹{amount:,.0f} has been {status}.\n"
        + (f"\nNote: {admin_note}\n" if admin_note else "")
    )
    send_email(employee_email, subject, body)


def notify_exit_initiated(
    employee_name: str, employee_code: str, resignation_date: str, last_working_day: str, hr_email: str,
) -> None:
    if not hr_email:
        return
    subject = f"Exit process started — {employee_name} ({employee_code})"
    body = (
        f"An exit has been initiated for {employee_name} ({employee_code}).\n\n"
        f"Resignation date: {resignation_date}\n"
        f"Last working day: {last_working_day}\n\n"
        f"Track departmental clearance and the exit interview in the JADE HR console: "
        f"https://jade-hr.vercel.app/admin/exit\n"
    )
    send_email(hr_email, subject, body)
