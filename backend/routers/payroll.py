from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_admin
from database import supabase
from payroll import compute_monthly_summary

router = APIRouter(prefix="/api", tags=["payroll"])


def _month_bounds(year: int, month: int) -> tuple[str, str]:
    from payroll import days_in_month

    last_day = days_in_month(year, month)
    from_dt = f"{year:04d}-{month:02d}-01T00:00:00+00:00"
    to_dt = f"{year:04d}-{month:02d}-{last_day:02d}T23:59:59+00:00"
    return from_dt, to_dt


def _fetch_punch_times(employee_code: str, year: int, month: int) -> list[datetime]:
    from_dt, to_dt = _month_bounds(year, month)
    resp = (
        supabase.table("hr_biometric_punches")
        .select("punch_time")
        .eq("employee_code", employee_code)
        .gte("punch_time", from_dt)
        .lte("punch_time", to_dt)
        .execute()
    )
    return [datetime.fromisoformat(r["punch_time"]) for r in resp.data]


def _fetch_all_punches_by_employee(year: int, month: int) -> dict[str, list[datetime]]:
    """One (paginated) query for the whole month instead of one query per employee."""
    from_dt, to_dt = _month_bounds(year, month)
    by_employee: dict[str, list[datetime]] = {}
    page_size = 1000
    start = 0
    while True:
        resp = (
            supabase.table("hr_biometric_punches")
            .select("employee_code,punch_time")
            .gte("punch_time", from_dt)
            .lte("punch_time", to_dt)
            .range(start, start + page_size - 1)
            .execute()
        )
        rows = resp.data
        for r in rows:
            by_employee.setdefault(r["employee_code"], []).append(datetime.fromisoformat(r["punch_time"]))
        if len(rows) < page_size:
            break
        start += page_size
    return by_employee


def _get_active_employee(employee_id: str) -> dict:
    resp = supabase.table("hr_employees").select("*").eq("id", employee_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return resp.data


@router.get("/payroll")
def payroll_for_month(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    admin: dict = Depends(require_admin),
):
    employees = supabase.table("hr_employees").select("*").eq("is_active", True).execute().data
    punches_by_employee = _fetch_all_punches_by_employee(year, month)
    summaries = []
    for employee in employees:
        punches = punches_by_employee.get(employee["employee_code"], [])
        summary = compute_monthly_summary(employee, year, month, punches)
        summary.pop("daily")
        summaries.append(summary)
    return summaries


@router.get("/payroll/{employee_id}")
def payroll_for_employee(
    employee_id: str,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: dict = Depends(get_current_user),
):
    if user["role"] != "admin" and user["id"] != employee_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    employee = _get_active_employee(employee_id)
    punches = _fetch_punch_times(employee["employee_code"], year, month)
    return compute_monthly_summary(employee, year, month, punches)


@router.get("/me/payroll")
def my_payroll(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: dict = Depends(get_current_user),
):
    punches = _fetch_punch_times(user["employee_code"], year, month)
    return compute_monthly_summary(user, year, month, punches)
