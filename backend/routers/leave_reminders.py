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
from datetime import datetime

from fastapi import APIRouter, Depends, Query

import email_service
from auth import require_console
from config import IST
from database import supabase
from routers.leave import _attach_reporting_manager

router = APIRouter(prefix="/api/leave-reminders", tags=["leave-reminders"])

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

    # Approvers per request: linked reporting manager + leave approver.
    emp_ids = list({r["employee_id"] for r in pending})
    profiles = {
        p["employee_id"]: p for p in (
            supabase.table("hr_employee_profile").select("employee_id,reporting_to_id,reporting_to_email")
            .in_("employee_id", emp_ids).execute().data if emp_ids else []
        ) or []
    }
    approver_ids = {
        i for r in pending for i in (
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
    by_recipient: dict[str, dict] = {}
    unreachable = 0
    for r in pending:
        p = profiles.get(r["employee_id"], {})
        targets = [approvers.get(i) for i in (p.get("reporting_to_id"), (r.get("hr_employees") or {}).get("leave_approver_id"))]
        recipients = {a["email"].lower(): (_full_name(a), a.get("role")) for a in targets if a}
        if not recipients and p.get("reporting_to_email"):
            known = people_by_email.get(p["reporting_to_email"].lower())
            recipients[p["reporting_to_email"].lower()] = (
                (_full_name(known) if known else r["hr_employees"].get("reporting_manager")) or "", (known or {}).get("role", "employee"),
            )
        if not recipients:
            unreachable += 1
        for email, (name, role) in recipients.items():
            by_recipient.setdefault(email, {"name": name, "role": role, "requests": []})["requests"].append(r)

    overdue = [r for r in pending if _waiting_days(r, today) > OVERDUE_DAYS]
    past = [r for r in pending if r["end_date"] < today.isoformat()]
    per_manager = Counter((r.get("hr_employees") or {}).get("reporting_manager") or "No reporting manager" for r in pending)
    no_mgr = _no_manager_summary() if include_weekly else {"missing": 0, "suggested": 0, "ambiguous": 0, "by_location": Counter()}
    no_mgr_count = no_mgr["missing"] + no_mgr["suggested"] + no_mgr["ambiguous"]

    results = []
    if pending:
        for email, info in sorted(by_recipient.items()):
            reqs = info["requests"]
            n = len(reqs)
            link = f"{CONSOLE}/{'admin' if info['role'] in ('hr', 'accounts') else 'employee'}/team-leave"
            lines = [
                f"Hi {info['name'].split(' ')[0] or 'there'},", "",
                f"{n} leave request{'s' if n != 1 else ''} from your team {'are' if n != 1 else 'is'} waiting for a decision, oldest first:", "",
                *(_line(r, today) for r in reqs), "",
                "Please approve or reject them so attendance and payroll stay correct.",
                f"Review them here: {link}",
            ]
            subject = f"{n} leave request{'s' if n != 1 else ''} waiting for you"
            ok, err = (None, "dry_run") if dry_run else email_service.send_email_detailed(
                email, subject, "\n".join(lines), kind="leave_reminder",
            )
            results.append({"recipient": email, "name": info["name"], "count": n, "emailed": ok, "email_error": err})

    hr_lines = [
        f"Pending leave as of {today.isoformat()}: {len(pending)} request{'s' if len(pending) != 1 else ''}.",
        f"  • Waiting more than {OVERDUE_DAYS} days: {len(overdue)}",
        f"  • Dates already passed, still not approved or rejected: {len(past)}",
        f"  • No approver with an email to remind: {unreachable}",
        f"  • Reminders sent to {len(by_recipient)} approver{'s' if len(by_recipient) != 1 else ''}",
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
    hr_lines += ["", f"Leave requests: {CONSOLE}/admin/leave"]
    hr_emailed, hr_error = False, "empty_list"
    if pending or (include_weekly and no_mgr_count):
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
