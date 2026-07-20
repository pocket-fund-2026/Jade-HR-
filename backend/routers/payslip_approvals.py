from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_permission
from database import maybe_single_data, supabase
from models import PayslipApprovalCreate, PayslipApprovalResolve
from payroll import compute_monthly_summary
from routers.leave import fetch_approved_leaves
from routers.payroll import _fetch_compliance_profile, _fetch_holidays, _fetch_overrides, _fetch_punch_times

router = APIRouter(prefix="/api", tags=["payslip-approvals"])


@router.post("/me/payslip-approvals")
def submit_payslip_approval(body: PayslipApprovalCreate, user: dict = Depends(get_current_user)):
    """HR-role self-service: submit a pay period's payslip for Accounts
    sign-off — accounts' own payslip needs no such approval. Upserting
    resets a previously-rejected submission back to pending rather than
    piling up rows, one live status per pay period (mirrors how
    hr_attendance_overrides is upserted on dispute approval)."""
    if user["role"] != "hr":
        raise HTTPException(status_code=403, detail="Only HR-role logins submit their payslip for approval")
    row = {
        "employee_id": user["id"],
        "period_year": body.period_year,
        "period_month": body.period_month,
        "status": "pending",
        "submitted_at": datetime.now(timezone.utc).isoformat(),
        "admin_note": "",
        "resolved_by": None,
        "resolved_at": None,
        "seen_by_employee": False,
    }
    inserted = (
        supabase.table("hr_payslip_approvals")
        .upsert(row, on_conflict="employee_id,period_year,period_month")
        .execute()
    )
    return inserted.data[0]


@router.get("/me/payslip-approvals")
def my_payslip_approvals(user: dict = Depends(get_current_user)):
    resp = (
        supabase.table("hr_payslip_approvals")
        .select("*")
        .eq("employee_id", user["id"])
        .order("period_year", desc=True)
        .order("period_month", desc=True)
        .execute()
    )
    # Mark resolved submissions as seen the moment the employee views this list.
    unseen_resolved = [r["id"] for r in resp.data if r["status"] != "pending" and not r["seen_by_employee"]]
    if unseen_resolved:
        supabase.table("hr_payslip_approvals").update({"seen_by_employee": True}).in_("id", unseen_resolved).execute()
    return resp.data


def _net_salary_for(employee_id: str, period_year: int, period_month: int, holidays: list[dict]) -> float:
    """Recomputes the same figure /api/me/payroll would show for that
    employee/period, so Accounts sees the amount inline on the approvals
    list without navigating away to look it up."""
    resp = supabase.table("hr_employees").select("*").eq("id", employee_id).maybe_single().execute()
    employee = maybe_single_data(resp)
    if not employee:
        return 0.0
    employee = {**employee, **_fetch_compliance_profile(employee_id)}
    punches = _fetch_punch_times(employee["employee_code"], period_year, period_month)
    overrides = _fetch_overrides(employee_id, period_year, period_month)
    leaves = fetch_approved_leaves(employee_id, period_year, period_month)
    summary = compute_monthly_summary(employee, period_year, period_month, punches, overrides, leaves, holidays)
    return summary["total_payable"]


@router.get("/payslip-approvals")
def list_payslip_approvals(
    status: str | None = Query(None), admin: dict = Depends(require_permission("payslip_approvals.manage")),
):
    query = supabase.table("hr_payslip_approvals").select(
        "*, hr_employees!hr_payslip_approvals_employee_id_fkey(first_name,last_name,employee_code,location)"
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("submitted_at", desc=True).execute()
    rows = resp.data
    if rows:
        # Holidays are the same for every row (no year/month filter) — fetch
        # once. Each row's net-salary recompute is otherwise ~5 sequential
        # Supabase reads for an unrelated employee/period, so run rows
        # concurrently instead of one after another.
        holidays = _fetch_holidays()
        with ThreadPoolExecutor(max_workers=min(8, len(rows))) as pool:
            net_salaries = list(pool.map(
                lambda r: _net_salary_for(r["employee_id"], r["period_year"], r["period_month"], holidays), rows,
            ))
        for r, net_salary in zip(rows, net_salaries):
            r["net_salary"] = net_salary
    return rows


@router.put("/payslip-approvals/{approval_id}")
def resolve_payslip_approval(
    approval_id: str, body: PayslipApprovalResolve, admin: dict = Depends(require_permission("payslip_approvals.manage")),
):
    existing = supabase.table("hr_payslip_approvals").select("*").eq("id", approval_id).maybe_single().execute()
    approval = maybe_single_data(existing)
    if not approval:
        raise HTTPException(status_code=404, detail="Submission not found")
    if approval["status"] != "pending":
        raise HTTPException(status_code=409, detail="Submission already resolved")
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    supabase.table("hr_payslip_approvals").update({
        "status": "approved" if body.action == "approve" else "rejected",
        "admin_note": body.admin_note,
        "resolved_by": admin["id"],
        "resolved_at": datetime.now(timezone.utc).isoformat(),
        "seen_by_employee": False,
    }).eq("id", approval_id).execute()

    return {"ok": True}
