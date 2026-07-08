from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_admin
from database import supabase
from payroll import compute_monthly_summary

router = APIRouter(prefix="/api", tags=["payroll"])


def _fetch_punch_times(employee_code: str, year: int, month: int) -> list[datetime]:
    from payroll import days_in_month

    last_day = days_in_month(year, month)
    from_dt = f"{year:04d}-{month:02d}-01T00:00:00+00:00"
    to_dt = f"{year:04d}-{month:02d}-{last_day:02d}T23:59:59+00:00"

    resp = (
        supabase.table("hr_biometric_punches")
        .select("punch_time")
        .eq("employee_code", employee_code)
        .gte("punch_time", from_dt)
        .lte("punch_time", to_dt)
        .execute()
    )
    return [datetime.fromisoformat(r["punch_time"]) for r in resp.data]


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
    summaries = []
    for employee in employees:
        punches = _fetch_punch_times(employee["employee_code"], year, month)
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
