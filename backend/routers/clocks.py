"""Upcoming HR "clocks" — deadlines someone needs to act on before they lapse:
active Attendance Improvement Plans, probation completions still awaiting
confirmation, and employees serving their notice period. Each already existed
as data (hr_aip_records; hr_employee_profile.probation_completion_date/
confirmation_date; hr_employee_profile.employee_status == "On Notice" +
scheduled_exit_date) but had no combined view — AIP's own countdown was
buried inside the AIP page, and probation/notice had no countdown anywhere.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends

from auth import require_permission
from database import supabase

router = APIRouter(prefix="/api/clocks", tags=["clocks"])

# How far ahead a probation completion has to be to show up at all — without
# this every employee ever on probation with no confirmation_date set would
# show up regardless of how far off (or long past, for old/dirty data) their
# date is. Notice period and AIP don't need this: both are inherently
# short-lived, self-limiting states (someone actively on notice / on an
# active AIP), not a field that silently accumulates stale rows.
PROBATION_LOOKAHEAD_DAYS = 30


def _employees_by_id(employee_ids: list[str]) -> dict[str, dict]:
    if not employee_ids:
        return {}
    rows = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,department,location,is_active")
        .in_("id", list(set(employee_ids)))
        .execute()
        .data
    )
    return {r["id"]: r for r in rows}


def _person(emp: dict) -> dict:
    return {
        "employee_id": emp["id"],
        "employee_code": emp["employee_code"],
        "name": f"{emp['first_name']} {emp.get('last_name', '')}".strip(),
        "department": emp.get("department", ""),
        "location": emp.get("location", ""),
    }


@router.get("")
def get_clocks(user: dict = Depends(require_permission("employees.view"))):
    today = date.today()

    # ---- AIP: active records, days remaining off end_date (can go negative
    # if HR hasn't closed one out past its own deadline — surfaced, not hidden) ----
    aip_records = supabase.table("hr_aip_records").select("*").eq("status", "active").execute().data
    aip_employees = _employees_by_id([r["employee_id"] for r in aip_records])
    aip = [
        {
            **_person(aip_employees[r["employee_id"]]),
            "start_date": r["start_date"],
            "end_date": r["end_date"],
            "days_remaining": (date.fromisoformat(r["end_date"]) - today).days,
        }
        for r in aip_records
        if r["employee_id"] in aip_employees and aip_employees[r["employee_id"]]["is_active"]
    ]

    # ---- Probation: completion date set, not yet confirmed, due within the
    # lookahead window (or already overdue) ----
    cutoff = (today + timedelta(days=PROBATION_LOOKAHEAD_DAYS)).isoformat()
    probation_profiles = [
        p
        for p in (
            supabase.table("hr_employee_profile")
            .select("employee_id,probation_completion_date,confirmation_date")
            .is_("confirmation_date", "null")
            .execute()
            .data
        )
        if p.get("probation_completion_date") and p["probation_completion_date"] <= cutoff
    ]
    probation_employees = _employees_by_id([p["employee_id"] for p in probation_profiles])
    probation = [
        {
            **_person(probation_employees[p["employee_id"]]),
            "probation_completion_date": p["probation_completion_date"],
            "days_remaining": (date.fromisoformat(p["probation_completion_date"]) - today).days,
        }
        for p in probation_profiles
        if p["employee_id"] in probation_employees and probation_employees[p["employee_id"]]["is_active"]
    ]

    # ---- Notice period: employee_status == "On Notice" with a scheduled exit date ----
    notice_profiles = [
        p
        for p in (
            supabase.table("hr_employee_profile")
            .select("employee_id,scheduled_exit_date,employee_status")
            .eq("employee_status", "On Notice")
            .execute()
            .data
        )
        if p.get("scheduled_exit_date")
    ]
    notice_employees = _employees_by_id([p["employee_id"] for p in notice_profiles])
    notice = [
        {
            **_person(notice_employees[p["employee_id"]]),
            "scheduled_exit_date": p["scheduled_exit_date"],
            "days_remaining": (date.fromisoformat(p["scheduled_exit_date"]) - today).days,
        }
        for p in notice_profiles
        if p["employee_id"] in notice_employees and notice_employees[p["employee_id"]]["is_active"]
    ]

    aip.sort(key=lambda r: r["days_remaining"])
    probation.sort(key=lambda r: r["days_remaining"])
    notice.sort(key=lambda r: r["days_remaining"])

    return {"aip": aip, "probation": probation, "notice": notice}
