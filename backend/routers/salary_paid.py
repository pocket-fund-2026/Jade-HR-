from calendar import monthrange
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, Query

from auth import require_permission
from database import supabase
from models import SalaryPaidUpdate

router = APIRouter(prefix="/api/reports/salary-paid", tags=["salary-paid"])


@router.get("")
def salary_paid_status(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: dict = Depends(require_permission("payroll.view")),
):
    """Every active employee for the selected month, with whether Accounts
    has checked them off as paid — plus any arrear already logged for that
    same period, so the checklist can flag "not paid + no arrear yet" at a
    glance."""
    employees = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,location")
        .eq("is_active", True)
        .execute()
        .data
    )
    paid_rows = (
        supabase.table("hr_salary_paid_status")
        .select("employee_id,paid,marked_at")
        .eq("year", year)
        .eq("month", month)
        .execute()
        .data
    )
    paid_by_employee = {r["employee_id"]: r for r in paid_rows}

    start = date(year, month, 1)
    end = date(year, month, monthrange(year, month)[1])
    arrear_rows = (
        supabase.table("hr_arrears")
        .select("employee_id,arrear_amount")
        .gte("effective_date", start.isoformat())
        .lte("effective_date", end.isoformat())
        .execute()
        .data
    )
    arrears_by_employee: dict[str, float] = {}
    for r in arrear_rows:
        arrears_by_employee[r["employee_id"]] = arrears_by_employee.get(r["employee_id"], 0) + float(r["arrear_amount"] or 0)

    result = []
    for e in sorted(employees, key=lambda e: (e.get("location") or "", e["first_name"])):
        status = paid_by_employee.get(e["id"])
        result.append({
            "employee_id": e["id"],
            "employee_code": e["employee_code"],
            "name": f"{e['first_name']} {e.get('last_name', '')}".strip(),
            "location": e.get("location", ""),
            "paid": bool(status["paid"]) if status else False,
            "marked_at": status["marked_at"] if status else None,
            "arrear_this_month": round(arrears_by_employee.get(e["id"], 0), 2),
        })
    return result


@router.put("/{employee_id}")
def set_salary_paid(
    employee_id: str,
    body: SalaryPaidUpdate,
    user: dict = Depends(require_permission("payroll.view")),
):
    row = {
        "employee_id": employee_id,
        "year": body.year,
        "month": body.month,
        "paid": body.paid,
        "marked_by": user["id"],
        "marked_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = supabase.table("hr_salary_paid_status").upsert(row, on_conflict="employee_id,year,month").execute()
    return resp.data[0]
