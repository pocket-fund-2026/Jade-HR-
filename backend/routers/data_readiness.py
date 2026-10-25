"""Data Readiness report (read-only): is the data payroll, attendance and any
AI feature read fit to trust? Logic lives in data_readiness.py; this module
only fetches rows and assembles the response. Nothing here writes."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

import data_readiness as dr
from auth import require_permission
from config import IST
from database import supabase
from payroll import pay_period_bounds
from workflow_log import WORKFLOWS

router = APIRouter(prefix="/api/data-readiness", tags=["data-readiness"])

PERM = require_permission("data_readiness.view")

PAGE = 1000


def _fetch_all(table: str, columns: str, **eq) -> list[dict]:
    """PostgREST caps a response at 1000 rows; page through so a check never
    silently looks at only the first thousand."""
    rows: list[dict] = []
    start = 0
    while True:
        q = supabase.table(table).select(columns)
        for k, v in eq.items():
            q = q.eq(k, v)
        batch = q.range(start, start + PAGE - 1).execute().data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            return rows
        start += PAGE


def _latest(table: str, column: str):
    # Postgres sorts NULLs first when descending, so exclude them or a column
    # that is only partly filled reports "never".
    data = supabase.table(table).select(column).not_.is_(column, "null").order(column, desc=True).limit(1).execute().data
    return data[0][column] if data else None


def _current_period(today):
    year, month = (today.year + 1, 1) if (today.month == 12 and today.day >= 23) else (
        (today.year, today.month + 1) if today.day >= 23 else (today.year, today.month)
    )
    return pay_period_bounds(year, month)


@router.get("/workflow-log")
def workflow_log(workflow: str | None = None, employee_id: str | None = None, limit: int = 100,
                 user: dict = Depends(PERM)):
    """Recent steps from the shared workflow log, newest first, with the actor's
    and the employee's names resolved so the page needs no second lookup."""
    q = supabase.table("hr_workflow_events").select("*").order("created_at", desc=True).limit(max(1, min(limit, 500)))
    if workflow:
        q = q.eq("workflow", workflow)
    if employee_id:
        q = q.eq("employee_id", employee_id)
    rows = q.execute().data or []
    ids = {r[k] for r in rows for k in ("actor_id", "employee_id") if r.get(k)}
    names = {}
    if ids:
        for e in supabase.table("hr_employees").select("id,first_name,last_name,employee_code").in_("id", list(ids)).execute().data or []:
            names[e["id"]] = f"{e['first_name']} {e.get('last_name') or ''}".strip()
    for r in rows:
        r["actor_name"] = names.get(r.get("actor_id"), "")
        r["employee_name"] = names.get(r.get("employee_id"), "")
        r["workflow_label"] = WORKFLOWS.get(r["workflow"], r["workflow"])
    return {"workflows": WORKFLOWS, "events": rows}


@router.get("")
def readiness(user: dict = Depends(PERM)):
    now = datetime.now(timezone.utc)
    today = datetime.now(IST).date()
    start, end = _current_period(today)

    all_emps = _fetch_all(
        "hr_employees",
        "id,employee_code,first_name,last_name,role,is_active,email,phone,date_of_joining,"
        "basic,hra,conveyance,other_allowance,monthly_bonus,retention,incentive,"
        "leave_approver_id,roster_unmatched_streak,password_changed_by_employee",
    )
    employees = [e for e in all_emps if e.get("is_active")]
    profiles = {
        p["employee_id"]: p
        for p in _fetch_all(
            "hr_employee_profile",
            "employee_id,time_slot,date_of_birth,pan_no,aadhar_no,bank_account_no,bank_ifsc",
        )
    }
    register_rows = [
        r for r in _fetch_all("hr_attendance_register", "employee_id,date")
        if start.isoformat() <= r["date"] <= end.isoformat()
    ]
    hr_permissions = _fetch_all("hr_permissions", "permission_key,hr_can_access")

    feeds = [
        dr.feed_status("Biometric punches", "HR", 6, _latest("hr_sync_log", "run_at"), now,
                       "Attendance, late marks, OT, payroll days"),
        dr.feed_status("Employee roster sync", "HR", 36, _latest("hr_employees", "roster_last_seen_at"), now,
                       "Who exists and who is active"),
        dr.feed_status("Outbound email", "HR", 24 * 7, _latest("hr_email_log", "created_at"), now,
                       "Leave decisions, letters, digests"),
    ]

    checks = (
        dr.quality_checks(employees, profiles)
        + dr.duplicate_checks(employees, profiles)
        + [dr.roster_streak_check(employees)]
        + dr.access_checks(all_emps, hr_permissions)
    )
    register = dr.register_coverage(register_rows, employees, start, end)
    checks.append(register["partial"])

    overall = dr.overall_decision(checks + [{"severity": f["severity"]} for f in feeds])
    return {
        "generated_at": now.isoformat(),
        "decision": overall,
        "active_employees": len(employees),
        "checks": checks,
        "feeds": feeds,
        "register": {k: v for k, v in register.items() if k != "partial"},
        "definitions": dr.policy_definitions(),
    }
