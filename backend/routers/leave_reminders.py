"""Pending-leave reminder digest.

Leave requests were piling up unresolved (36 pending on 2026-10-21, 27 of them
for dates already past), because the only nudge was the one email sent when a
request is filed. This is the daily follow-up, same shape as the late and
clocks digests:

  each approver    their own team's pending requests, oldest first: the
                   employee's reporting manager and their leave approver, if
                   different, each get it (inactive or email-less people are
                   skipped)
  HR               one company-wide summary: totals, requests waiting longer
                   than OVERDUE_DAYS, requests whose dates have already
                   passed, and the count per manager. On Mondays (or with
                   weekly=true) it also lists how many active employees have
                   no reporting manager, by location, since nobody can be
                   reminded about those.

Sends nothing when nothing is pending. Triggered once a day by
leave_reminder_notify.py from cron; dry_run=true computes everything and
sends nothing.
"""

from collections import Counter
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query

import email_service
from auth import require_console
from config import IST
from database import supabase
from routers.leave import _attach_reporting_manager, current_cycle_start

router = APIRouter(prefix="/api/leave-reminders", tags=["leave-reminders"])

CUTOFF_WARNING_DAYS = 4  # approvers get the pay-cycle warning this many days before the cutoff
OVERDUE_DAYS = 3  # a request waiting longer than this is flagged as overdue
LEAVE_LABELS = {
    "paid": "Paid Leave", "casual": "Casual Leave", "sick": "Sick Leave", "earned": "Privilege Leave",
    "unpaid": "Unpaid Leave", "other": "Other", "paternity": "Paternity Leave", "maternity": "Maternity Leave",
    "compassionate": "Compassionate Leave", "comp_off": "Comp-Off",
}
CONSOLE = "https://jade-hr.vercel.app"


def _full_name(e: dict) -> str:
    return f"{e.get('first_name', '')} {e.get('last_name') or ''}".strip()


def _waiting_days(r: dict, today) -> int:
    created = (r.get("created_at") or "")[:10]
    return (today - datetime.fromisoformat(created).date()).days if created else 0


def _line(r: dict, today) -> str:
    e = r.get("hr_employees") or {}
    days = (datetime.fromisoformat(r["end_date"]) - datetime.fromisoformat(r["start_date"])).days + 1
    flags = []
    if r["end_date"] < today.isoformat():
        flags.append("dates already passed")
    waited = _waiting_days(r, today)
    if waited > OVERDUE_DAYS:
        flags.append(f"waiting {waited} days")
    flag = f"  [{', '.join(flags)}]" if flags else ""
    return (
        f"  • {_full_name(e)} ({e.get('employee_code', '')}): {LEAVE_LABELS.get(r.get('leave_type'), r.get('leave_type', ''))}, "
        f"{r['start_date']} to {r['end_date']} ({days} day{'s' if days != 1 else ''}){flag}"
    )


def _open_wfh_requests(today) -> list[dict]:
    """WFH requests that need someone: pending (Senior Management / HR Head
    approval) and approved ones whose dates are over but whose completion the
    reporting manager has not yet confirmed (doc §25)."""
    rows = (
        supabase.table("hr_wfh_requests")
        .select("*, hr_employees!hr_wfh_requests_employee_id_fkey(first_name,last_name,employee_code,leave_approver_id)")
        .in_("status", ["pending", "approved"]).order("created_at").execute().data
    ) or []
    return [
        w for w in rows
        if w["status"] == "pending" or (w.get("work_completed") is None and w["end_date"] <= today.isoformat())
    ]


def _wfh_line(w: dict, today) -> str:
    e = w.get("hr_employees") or {}
    days = (datetime.fromisoformat(w["end_date"]) - datetime.fromisoformat(w["start_date"])).days + 1
    waited = _waiting_days(w, today)
    flag = f"  [waiting {waited} days]" if waited > OVERDUE_DAYS else ""
    return (
        f"  • {_full_name(e)} ({e.get('employee_code', '')}): {w['start_date']} to {w['end_date']} "
        f"({days} day{'s' if days != 1 else ''}){flag}"
    )


def _no_manager_summary() -> dict:
    """Same buckets as the Reporting Managers page (routers.employees.
    list_reporting_managers), so the weekly email and the page agree."""
    from routers.employees import list_reporting_managers

    rows = list_reporting_managers(user={})["rows"]
    missing = [r for r in rows if r["status"] == "missing"]
    return {
        "missing": len(missing),
        "suggested": sum(1 for r in rows if r["status"] == "suggested"),
        "ambiguous": sum(1 for r in rows if r["status"] == "ambiguous"),
        "by_location": Counter(r.get("location") or "No location" for r in missing),
    }


@router.post("/digest")
def leave_reminder_digest(
    dry_run: bool = Query(default=False),
    weekly: bool | None = Query(default=None, description="Include the no-manager section; defaults to Mondays"),
    user: dict = Depends(require_console),
):
    today = datetime.now(IST).date()
    include_weekly = today.weekday() == 0 if weekly is None else weekly
    pending = (
        supabase.table("hr_leave_requests")
        .select("*, hr_employees!hr_leave_requests_employee_id_fkey(first_name,last_name,employee_code,location,department,leave_approver_id)")
        .eq("status", "pending")
        .order("created_at")
        .execute()
        .data
    ) or []
    _attach_reporting_manager(pending)
    wfh_open = _open_wfh_requests(today)

    # Approvers per request: linked reporting manager + leave approver.
    emp_ids = list({r["employee_id"] for r in pending} | {w["employee_id"] for w in wfh_open})
    profiles = {
        p["employee_id"]: p for p in (
            supabase.table("hr_employee_profile").select("employee_id,reporting_to_id,reporting_to_email")
            .in_("employee_id", emp_ids).execute().data if emp_ids else []
        ) or []
    }
    approver_ids = {
        i for r in [*pending, *wfh_open] for i in (
            profiles.get(r["employee_id"], {}).get("reporting_to_id"), (r.get("hr_employees") or {}).get("leave_approver_id"),
        ) if i
    }
    approvers = {
        a["id"]: a for a in (
            supabase.table("hr_employees").select("id,first_name,last_name,email,role,is_active")
            .in_("id", list(approver_ids)).execute().data if approver_ids else []
        ) or [] if a.get("is_active") and a.get("email")
    }

    # Real name and role for a recipient reached only through the email on
    # file (reporting_to_email), so the greeting and console link are right.
    people_by_email = {
        a["email"].lower(): a for a in (
            supabase.table("hr_employees").select("first_name,last_name,email,role").eq("is_active", True).execute().data or []
        ) if a.get("email")
    }
    def recipients_for(r: dict) -> dict[str, tuple[str, str]]:
        p = profiles.get(r["employee_id"], {})
        targets = [approvers.get(i) for i in (p.get("reporting_to_id"), (r.get("hr_employees") or {}).get("leave_approver_id"))]
        recipients = {a["email"].lower(): (_full_name(a), a.get("role")) for a in targets if a}
        if not recipients and p.get("reporting_to_email"):
            known = people_by_email.get(p["reporting_to_email"].lower())
            recipients[p["reporting_to_email"].lower()] = (
                (_full_name(known) if known else (r.get("hr_employees") or {}).get("reporting_manager")) or "", (known or {}).get("role", "employee"),
            )
        return recipients

    by_recipient: dict[str, dict] = {}
    unreachable = 0
    for r in pending:
        recipients = recipients_for(r)
        if not recipients:
            unreachable += 1
        for email, (name, role) in recipients.items():
            by_recipient.setdefault(email, {"name": name, "role": role, "requests": []})["requests"].append(r)
    wfh_by_recipient: dict[str, dict] = {}
    for w in wfh_open:
        for email, (name, role) in recipients_for(w).items():
            wfh_by_recipient.setdefault(email, {"name": name, "role": role, "requests": []})["requests"].append(w)
    all_recipients = {**wfh_by_recipient, **by_recipient}
    for email, info in wfh_by_recipient.items():
        all_recipients[email] = {**info, "requests": by_recipient.get(email, {}).get("requests", [])}

    overdue = [r for r in pending if _waiting_days(r, today) > OVERDUE_DAYS]
    past = [r for r in pending if r["end_date"] < today.isoformat()]
    per_manager = Counter((r.get("hr_employees") or {}).get("reporting_manager") or "No reporting manager" for r in pending)
    no_mgr = _no_manager_summary() if include_weekly else {"missing": 0, "suggested": 0, "ambiguous": 0, "by_location": Counter()}
    no_mgr_count = no_mgr["missing"] + no_mgr["suggested"] + no_mgr["ambiguous"]

    # Pay-cycle cutoff: leave applications close on the 22nd. In the days leading up
    # to it, tell approvers plainly that undecided requests hold up their team's pay.
    cycle_start = current_cycle_start(today)
    next_cutoff = cycle_start.replace(year=cycle_start.year + (cycle_start.month == 12), month=cycle_start.month % 12 + 1)
    days_to_cutoff = (next_cutoff - today).days
    cutoff_warning = None
    if 0 < days_to_cutoff <= CUTOFF_WARNING_DAYS:
        cutoff_warning = (
            f"The pay cycle closes on {(next_cutoff - timedelta(days=1)).strftime('%d %b')} "
            f"({days_to_cutoff} day{'s' if days_to_cutoff != 1 else ''} left). Leave you have not approved or rejected by then "
            "cannot be counted correctly, and your team's pay will be affected. Please clear them today."
        )

    results = []
    for email, info in sorted(all_recipients.items()):
        reqs = info["requests"]
        n = len(reqs)
        wfh_reqs = wfh_by_recipient.get(email, {}).get("requests", [])
        if not n and not wfh_reqs:
            continue
        base = f"{CONSOLE}/{'admin' if info['role'] in ('hr', 'accounts') else 'employee'}"
        lines = [f"Hi {info['name'].split(' ')[0] or 'there'},", ""]
        if n:
            lines += [
                f"{n} leave request{'s' if n != 1 else ''} from your team {'are' if n != 1 else 'is'} waiting for a decision, oldest first:", "",
                *(_line(r, today) for r in reqs), "",
                "Please approve or reject them so attendance and payroll stay correct.",
                *([cutoff_warning] if cutoff_warning else []),
                f"Review them here: {base}/team-leave", "",
            ]
        if wfh_reqs:
            to_confirm = [w for w in wfh_reqs if w["status"] == "approved"]
            waiting = [w for w in wfh_reqs if w["status"] == "pending"]
            if to_confirm:
                lines += [
                    f"{len(to_confirm)} work-from-home request{'s' if len(to_confirm) != 1 else ''} from your team "
                    f"{'are' if len(to_confirm) != 1 else 'is'} approved and waiting for YOU to confirm the work was done "
                    "(unconfirmed days fall back to normal attendance rules in payroll):", "",
                    *(_wfh_line(w, today) for w in to_confirm), "",
                    f"Confirm here: {base}/team-wfh", "",
                ]
            if waiting:
                lines += [
                    f"{len(waiting)} work-from-home request{'s' if len(waiting) != 1 else ''} from your team "
                    f"{'are' if len(waiting) != 1 else 'is'} still waiting for Senior Management / HR Head approval "
                    "(no action needed from you yet; you confirm completion once approved):", "",
                    *(_wfh_line(w, today) for w in waiting), "",
                ]
        parts = []
        if n:
            parts.append(f"{n} leave request{'s' if n != 1 else ''}")
        if wfh_reqs:
            parts.append(f"{len(wfh_reqs)} WFH request{'s' if len(wfh_reqs) != 1 else ''}")
        subject = f"{' and '.join(parts)} waiting for you"
        ok, err = (None, "dry_run") if dry_run else email_service.send_email_detailed(
            email, subject, "\n".join(lines), kind="leave_reminder",
        )
        results.append({"recipient": email, "name": info["name"], "count": n, "wfh_count": len(wfh_reqs), "emailed": ok, "email_error": err})

    hr_lines = [
        f"Pending leave as of {today.isoformat()}: {len(pending)} request{'s' if len(pending) != 1 else ''}.",
        f"  • Waiting more than {OVERDUE_DAYS} days: {len(overdue)}",
        f"  • Dates already passed, still not approved or rejected: {len(past)}",
        f"  • No approver with an email to remind: {unreachable}",
        f"  • Reminders sent to {len(all_recipients)} approver{'s' if len(all_recipients) != 1 else ''}",
        f"  • WFH requests open: {sum(w['status'] == 'pending' for w in wfh_open)} awaiting Senior Management / HR Head approval, "
        f"{sum(w['status'] == 'approved' for w in wfh_open)} approved and awaiting the reporting manager's completion confirmation",
        "", "By reporting manager:",
        *(f"  • {name}: {n}" for name, n in per_manager.most_common()),
    ]
    if past:
        hr_lines += ["", "Oldest past-date requests:", *(_line(r, today) for r in past[:15])]
    if include_weekly:
        hr_lines += [
            "", f"Weekly check: {no_mgr_count} active employee{'s' if no_mgr_count != 1 else ''} are not linked to a reporting manager, "
            "so nobody is reminded about their leave:",
            f"  • {no_mgr['suggested']} can be linked in one click (the name on file matches one person)",
            f"  • {no_mgr['ambiguous']} have a name on file that matches more than one person",
            f"  • {no_mgr['missing']} have no manager at all. By location:",
            *(f"      {loc}: {n}" for loc, n in no_mgr["by_location"].most_common()),
            f"Assign them: {CONSOLE}/admin/reporting-managers",
        ]
    if cutoff_warning:
        hr_lines += ["", cutoff_warning.replace("Please clear them today.", "Approvers have been told.")]
    hr_lines += ["", f"Leave requests: {CONSOLE}/admin/leave"]
    hr_emailed, hr_error = False, "empty_list"
    if pending or wfh_open or (include_weekly and no_mgr_count):
        hr_subject = f"Pending leave: {len(pending)} waiting, {len(past)} past-date"
        hr_emailed, hr_error = (None, "dry_run") if dry_run else email_service.send_email_detailed(
            email_service.HR_NOTIFY_EMAIL, hr_subject, "\n".join(hr_lines), kind="leave_reminder_hr",
        )

    return {
        "date": today.isoformat(), "pending": len(pending), "overdue": len(overdue), "past_date": len(past),
        "unreachable": unreachable, "weekly": include_weekly, "no_manager": {k: v for k, v in no_mgr.items() if k != "by_location"},
        "hr_emailed": hr_emailed, "hr_email_error": hr_error, "manager_reminders": results,
        "hr_preview": "\n".join(hr_lines) if dry_run else None,
    }


APPROVAL_NOTICE_SUBJECT = "Action Required: Please approve your team's leave requests in the JADE HR Console"
APPROVAL_NOTICE_BODY = """Dear {first_name},

As a reporting manager, you are the approver for your team's leave requests in the JADE HR Console. This is a reminder to review and action every pending request promptly.

Why this matters
Leave that is not approved or rejected in the console cannot be recorded correctly. Payroll is calculated from the attendance and leave records in the console, so an unapproved leave can:
  • be treated as an absence, resulting in a Loss of Pay deduction for the employee;
  • change paid days, and therefore salary, for your team members; and
  • affect colleagues' payroll, as attendance and approvals are reconciled together at month-end.

What we need from you
  1. Sign in to the JADE HR Console: {console}
  2. Open Leave Approvals and review all pending requests, including past-dated ones.
  3. Approve or reject each request, so that nothing remains pending before the payroll cut-off (22nd of each month).

If a request is unclear, please speak with the employee directly and then record your decision in the console. For any help, reply to this email or contact the HR team.

Thank you for your prompt attention.

Warm regards,
Tina
JADE HR"""


@router.post("/approval-notice")
def approval_notice(
    send: bool = Query(default=False, description="Actually send; the default only previews the recipient list"),
    user: dict = Depends(require_console),
):
    """One-off notice to every active reporting manager: approve team leave in
    the console or payroll for their team can be affected. Previews by default;
    pass send=true to email. Recipients are the same active managers the
    Reporting Managers page resolves, de-duplicated by email."""
    from routers.employees import list_reporting_managers

    data = list_reporting_managers(user={})
    by_id = {m["id"]: m for m in data["managers"]}
    ids = {r["manager_id"] for r in data["rows"] if r.get("manager_id") and r.get("manager_active")}
    recipients: dict[str, str] = {}
    for i in ids:
        m = by_id.get(i)
        if m and m.get("email") and m.get("is_active", True):
            recipients.setdefault(m["email"].lower(), m["name"])
    results = []
    for email, name in sorted(recipients.items()):
        ok, err = (None, "preview") if not send else email_service.send_email_detailed(
            email, APPROVAL_NOTICE_SUBJECT,
            APPROVAL_NOTICE_BODY.format(first_name=(name.split(" ")[0] or "there"), console=CONSOLE),
            kind="leave_approval_notice",
        )
        results.append({"recipient": email, "name": name, "emailed": ok, "email_error": err})
    return {"sent": send, "count": len(results), "results": results}
