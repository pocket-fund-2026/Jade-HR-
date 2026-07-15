from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import require_permission
from database import maybe_single_data, supabase
from models import LeaveLedgerEntryCreate
from routers.leave import _days_in_range, _pl_accrued_to_date, earned_leave_balance_as_of

router = APIRouter(prefix="/api/leave-ledger", tags=["leave-ledger"])


@router.post("")
def create_entry(body: LeaveLedgerEntryCreate, user: dict = Depends(require_permission("leave.manage"))):
    row = {
        "employee_id": body.employee_id,
        "leave_type": body.leave_type,
        "transaction_type": body.transaction_type,
        "amount": body.amount,
        "remarks": body.remarks,
        "entry_date": body.entry_date.isoformat(),
        "created_by": user["id"],
    }
    inserted = supabase.table("hr_leave_ledger").insert(row).execute()
    return inserted.data[0]


@router.delete("/{entry_id}")
def delete_entry(entry_id: str, user: dict = Depends(require_permission("leave.manage"))):
    resp = supabase.table("hr_leave_ledger").delete().eq("id", entry_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"ok": True}


@router.get("")
def list_entries(
    employee_id: str | None = Query(default=None),
    status: str = Query(default="both"),  # active | inactive | both
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=200),
    user: dict = Depends(require_permission("leave.manage")),
):
    query = supabase.table("hr_leave_ledger").select(
        "*, hr_employees!hr_leave_ledger_employee_id_fkey(employee_code,first_name,last_name,is_active)",
        count="exact",
    )
    if employee_id:
        query = query.eq("employee_id", employee_id)
    if status != "both":
        emp_ids = [
            e["id"] for e in supabase.table("hr_employees").select("id").eq("is_active", status == "active").execute().data
        ]
        query = query.in_("employee_id", emp_ids or ["00000000-0000-0000-0000-000000000000"])
    start = (page - 1) * page_size
    resp = (
        query.order("entry_date", desc=True).order("created_at", desc=True).range(start, start + page_size - 1).execute()
    )
    return {"rows": resp.data, "total": resp.count}


# Auto-credit "policy date" convention invented for this report — the 1st of
# each accruing month. jade-hr has no scheduled accrual job; this purely
# reconstructs, as display rows, the same running total _pl_accrued_to_date
# already produces everywhere else (payslip PL ledger, balance checks), so
# the numbers always reconcile with the rest of the app.
def _auto_credit_rows(employee: dict, leave_type: str, year: int) -> list[dict]:
    if leave_type != "earned" or employee.get("employee_category") != "corporate":
        return []
    doj = employee.get("date_of_joining")
    today = datetime.now(timezone.utc).date()
    if year > today.year:
        return []
    rows = []
    prev_total = 0
    last_month = today.month if year == today.year else 12
    for month in range(1, last_month + 1):
        reference = date(year, month, 28)
        total = _pl_accrued_to_date(doj, reference, year)
        delta = total - prev_total
        prev_total = total
        if delta <= 0:
            continue
        entry_date = date(year, month, 1)
        if doj:
            doj_date = date.fromisoformat(doj)
            if doj_date.year == year and doj_date.month == month and doj_date > entry_date:
                entry_date = doj_date
        rows.append({
            "date": entry_date.isoformat(),
            "description": f"Auto Credit, Policy Date {entry_date.strftime('%d-%b-%Y')}",
            "cr": delta, "debit": 0, "adjusted_in_payslip": 0, "leave_approved": 0,
        })
    return rows


def _approved_leave_rows(employee_id: str, leave_type: str, year: int) -> list[dict]:
    """Every approved leave request of this type in the year debits the
    balance — shown under Adjusted in Payslip AND Leave Approved (jade-hr
    has one debit signal, not two independently-reconciled pipelines like
    the legacy system this report is modeled on; both columns mirror it)."""
    resp = (
        supabase.table("hr_leave_requests")
        .select("start_date,end_date")
        .eq("employee_id", employee_id)
        .eq("leave_type", leave_type)
        .eq("status", "approved")
        .gte("start_date", f"{year}-01-01")
        .lte("start_date", f"{year}-12-31")
        .execute()
    )
    rows = []
    for r in resp.data:
        days = _days_in_range(r["start_date"], r["end_date"])
        rows.append({
            "date": r["start_date"],
            "description": f"Adjusted in Payslip ({r['start_date']} to {r['end_date']})",
            "cr": 0, "debit": 0, "adjusted_in_payslip": days, "leave_approved": days,
        })
    return rows


def _manual_rows(employee_id: str, leave_type: str, year: int) -> list[dict]:
    resp = (
        supabase.table("hr_leave_ledger")
        .select("*")
        .eq("employee_id", employee_id)
        .eq("leave_type", leave_type)
        .gte("entry_date", f"{year}-01-01")
        .lte("entry_date", f"{year}-12-31")
        .execute()
    )
    rows = []
    for r in resp.data:
        amount = float(r["amount"])
        label = r["remarks"] or r["transaction_type"].replace("_", " ").title()
        rows.append({
            "date": r["entry_date"],
            "description": label,
            "cr": amount if amount > 0 else 0,
            "debit": -amount if amount < 0 else 0,
            "adjusted_in_payslip": 0, "leave_approved": 0,
        })
    return rows


@router.get("/report/{employee_id}")
def leave_ledger_report(
    employee_id: str,
    leave_type: str = Query(default="earned"),
    year: int = Query(...),
    user: dict = Depends(require_permission("leave.manage", "payroll.view")),
):
    emp_resp = supabase.table("hr_employees").select("*").eq("id", employee_id).maybe_single().execute()
    employee = maybe_single_data(emp_resp)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    opening_balance = (
        earned_leave_balance_as_of(employee, date(year - 1, 12, 31)) if leave_type == "earned" else 0.0
    )

    rows = (
        _auto_credit_rows(employee, leave_type, year)
        + _approved_leave_rows(employee_id, leave_type, year)
        + _manual_rows(employee_id, leave_type, year)
    )
    rows.sort(key=lambda r: r["date"])

    total_cr = round(sum(r["cr"] for r in rows), 2)
    total_debit = round(sum(r["debit"] for r in rows), 2)
    total_adjusted = round(sum(r["adjusted_in_payslip"] for r in rows), 2)
    total_approved = round(sum(r["leave_approved"] for r in rows), 2)
    closing_balance = round(opening_balance + total_cr - total_debit - max(total_adjusted, total_approved), 2)

    return {
        "employee_code": employee["employee_code"],
        "employee_name": f"{employee['first_name']} {employee.get('last_name', '')}".strip(),
        "leave_type": leave_type,
        "year": year,
        "opening_balance": round(opening_balance, 2),
        "rows": rows,
        "total_cr": total_cr,
        "total_debit": total_debit,
        "total_adjusted_in_payslip": total_adjusted,
        "total_leave_approved": total_approved,
        "closing_balance": closing_balance,
    }
