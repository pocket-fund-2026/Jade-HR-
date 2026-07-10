from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

import email_service
from auth import get_current_user, require_permission, user_can
from database import maybe_single_data, supabase
from models import CompOffGrant, LeaveRequestCreate, LeaveResolve
from payroll import pay_period_bounds

router = APIRouter(prefix="/api", tags=["leave"])

# Fixed annual allocations, enforced in code rather than a balances table.
# Unpaid leave has no cap. Corporate-roster staff (Leave & Attendance Policy
# v1.1) get a richer structure — 'earned' is that policy's Privilege Leave
# (PL): 24/yr accrued pro-rata, gated for the first 3 months of employment.
# Everyone else keeps the pre-policy flat allocations untouched.
LEAVE_ALLOCATIONS = {"casual": 12, "sick": 12, "earned": 15}
CORPORATE_LEAVE_ALLOCATIONS = {"casual": 12, "sick": 12, "earned": 24, "paternity": 3}
CORPORATE_ONLY_TYPES = {"paternity", "maternity", "compassionate", "comp_off"}
PL_PROBATION_DAYS = 91  # ~3 months
COMP_OFF_MAX_DAYS_PER_REQUEST = 2
COMP_OFF_VALIDITY_DAYS = 120


def _days_in_range(start: str, end: str) -> int:
    return (date.fromisoformat(end) - date.fromisoformat(start)).days + 1


def _pl_accrued_to_date(date_of_joining: str | None, today: date, year: int) -> int:
    """2 days/month, capped at 24/yr, pro-rated from date of joining (or Jan 1
    if joined in an earlier year). Fully accrued once the year is in the past."""
    accrual_start = date(year, 1, 1)
    if date_of_joining:
        doj = date.fromisoformat(date_of_joining)
        if doj.year == year:
            accrual_start = doj
        elif doj.year > year:
            return 0
    reference = date(year, 12, 31) if year < today.year else min(today, date(year, 12, 31))
    if reference < accrual_start:
        return 0
    months_elapsed = (reference.year - accrual_start.year) * 12 + reference.month - accrual_start.month + 1
    return min(24, max(0, months_elapsed) * 2)


def _comp_off_available(employee_id: str) -> float:
    today_iso = datetime.now(timezone.utc).date().isoformat()
    resp = (
        supabase.table("hr_comp_off_ledger")
        .select("units")
        .eq("employee_id", employee_id)
        .eq("status", "available")
        .gte("expiry_date", today_iso)
        .execute()
    )
    return sum(float(r["units"]) for r in resp.data)


def _consume_comp_off(employee_id: str, days_needed: float, leave_request_id: str) -> bool:
    """FIFO by expiry date. Returns False (consuming nothing) if the balance
    isn't actually there any more — caller must not approve in that case."""
    today_iso = datetime.now(timezone.utc).date().isoformat()
    resp = (
        supabase.table("hr_comp_off_ledger")
        .select("id,units")
        .eq("employee_id", employee_id)
        .eq("status", "available")
        .gte("expiry_date", today_iso)
        .order("expiry_date")
        .execute()
    )
    if sum(float(r["units"]) for r in resp.data) < days_needed - 1e-9:
        return False
    remaining = days_needed
    for entry in resp.data:
        if remaining <= 1e-9:
            break
        supabase.table("hr_comp_off_ledger").update({
            "status": "used", "used_in_leave_request_id": leave_request_id,
        }).eq("id", entry["id"]).execute()
        remaining -= float(entry["units"])
    return True


@router.post("/me/leave-requests")
def create_leave_request(body: LeaveRequestCreate, user: dict = Depends(get_current_user)):
    if body.end_date < body.start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")
    is_corporate = user.get("employee_category") == "corporate"
    requested_days = _days_in_range(body.start_date.isoformat(), body.end_date.isoformat())

    if body.leave_type in CORPORATE_ONLY_TYPES and not is_corporate:
        raise HTTPException(status_code=403, detail="This leave type is only available to corporate staff")

    if body.leave_type == "earned" and is_corporate:
        doj = user.get("date_of_joining")
        if doj and (date.today() - date.fromisoformat(doj)).days < PL_PROBATION_DAYS:
            raise HTTPException(
                status_code=400,
                detail="Privilege Leave is available after 3 months from your date of joining",
            )

    if body.leave_type == "comp_off":
        if requested_days > COMP_OFF_MAX_DAYS_PER_REQUEST:
            raise HTTPException(status_code=400, detail=f"Comp-Off requests can cover at most {COMP_OFF_MAX_DAYS_PER_REQUEST} days")
        if _comp_off_available(user["id"]) < requested_days:
            raise HTTPException(status_code=400, detail="Not enough available Comp-Off balance")

    row = {
        "employee_id": user["id"],
        "leave_type": body.leave_type,
        "start_date": body.start_date.isoformat(),
        "end_date": body.end_date.isoformat(),
        "reason": body.reason,
    }
    inserted = supabase.table("hr_leave_requests").insert(row).execute()

    approver_email = ""
    if user.get("leave_approver_id"):
        approver_resp = (
            supabase.table("hr_employees").select("email").eq("id", user["leave_approver_id"]).maybe_single().execute()
        )
        approver = maybe_single_data(approver_resp)
        approver_email = (approver or {}).get("email", "")
    employee_name = f"{user['first_name']} {user.get('last_name', '')}".strip()
    email_service.notify_leave_submitted(
        employee_name, body.leave_type, body.start_date.isoformat(), body.end_date.isoformat(), body.reason,
        approver_email, email_service.HR_NOTIFY_EMAIL,
    )

    return inserted.data[0]


@router.get("/me/leave-requests")
def my_leave_requests(user: dict = Depends(get_current_user)):
    resp = (
        supabase.table("hr_leave_requests")
        .select("*")
        .eq("employee_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    # Mark resolved requests as seen the moment the employee views this list.
    unseen_resolved = [r["id"] for r in resp.data if r["status"] != "pending" and not r["seen_by_employee"]]
    if unseen_resolved:
        supabase.table("hr_leave_requests").update({"seen_by_employee": True}).in_("id", unseen_resolved).execute()
    return resp.data


@router.get("/me/leave-balance")
def my_leave_balance(user: dict = Depends(get_current_user)):
    year = datetime.now(timezone.utc).year
    today = datetime.now(timezone.utc).date()
    is_corporate = user.get("employee_category") == "corporate"
    resp = (
        supabase.table("hr_leave_requests")
        .select("leave_type,start_date,end_date")
        .eq("employee_id", user["id"])
        .eq("status", "approved")
        .gte("start_date", f"{year}-01-01")
        .lte("start_date", f"{year}-12-31")
        .execute()
    )
    used = defaultdict(int)
    for r in resp.data:
        used[r["leave_type"]] += _days_in_range(r["start_date"], r["end_date"])

    allocations = dict(CORPORATE_LEAVE_ALLOCATIONS if is_corporate else LEAVE_ALLOCATIONS)
    if is_corporate:
        allocations["earned"] = _pl_accrued_to_date(user.get("date_of_joining"), today, year)

    balances = [
        {"leave_type": t, "allocated": allocated, "used": used.get(t, 0), "remaining": allocated - used.get(t, 0)}
        for t, allocated in allocations.items()
    ]

    uncapped = ["unpaid", "other"] + (["maternity", "compassionate"] if is_corporate else [])
    balances += [{"leave_type": t, "allocated": None, "used": used.get(t, 0), "remaining": None} for t in uncapped]

    if is_corporate:
        available = _comp_off_available(user["id"])
        balances.append({
            "leave_type": "comp_off",
            "allocated": round(available + used.get("comp_off", 0), 1),
            "used": used.get("comp_off", 0),
            "remaining": round(available, 1),
        })

    return balances


@router.get("/leave-requests")
def list_leave_requests(status: str | None = Query(None), admin: dict = Depends(require_permission("leave.manage"))):
    query = supabase.table("hr_leave_requests").select(
        "*, hr_employees!hr_leave_requests_employee_id_fkey(first_name,last_name,employee_code,location)"
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("created_at", desc=True).execute()
    return resp.data


@router.get("/me/team-leave-requests")
def my_team_leave_requests(status: str | None = Query(None), user: dict = Depends(get_current_user)):
    """Leave requests from anyone who lists this user as their leave
    approver — a scoped view, not a role. Any employee can hit this; it's
    naturally empty for someone nobody reports to."""
    reports_resp = supabase.table("hr_employees").select("id").eq("leave_approver_id", user["id"]).execute()
    report_ids = [r["id"] for r in reports_resp.data]
    if not report_ids:
        return []

    query = (
        supabase.table("hr_leave_requests")
        .select("*, hr_employees!hr_leave_requests_employee_id_fkey(first_name,last_name,employee_code,location)")
        .in_("employee_id", report_ids)
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("created_at", desc=True).execute()
    return resp.data


def _is_leave_approver(user: dict, leave_request: dict) -> bool:
    if user_can(user, "leave.manage"):
        return True
    employee_resp = (
        supabase.table("hr_employees").select("leave_approver_id").eq("id", leave_request["employee_id"]).maybe_single().execute()
    )
    employee = maybe_single_data(employee_resp)
    return bool(employee and employee.get("leave_approver_id") == user["id"])


@router.put("/leave-requests/{request_id}")
def resolve_leave_request(request_id: str, body: LeaveResolve, user: dict = Depends(get_current_user)):
    existing = supabase.table("hr_leave_requests").select("*").eq("id", request_id).maybe_single().execute()
    leave_request = maybe_single_data(existing)
    if not leave_request:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if not _is_leave_approver(user, leave_request):
        raise HTTPException(status_code=403, detail="Not authorized to resolve this leave request")
    if leave_request["status"] != "pending":
        raise HTTPException(status_code=409, detail="Leave request already resolved")
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    if body.action == "approve" and leave_request["leave_type"] == "comp_off":
        days_needed = _days_in_range(leave_request["start_date"], leave_request["end_date"])
        if not _consume_comp_off(leave_request["employee_id"], days_needed, request_id):
            raise HTTPException(status_code=409, detail="Comp-Off balance no longer covers this request")

    supabase.table("hr_leave_requests").update({
        "status": "approved" if body.action == "approve" else "rejected",
        "admin_note": body.admin_note,
        "resolved_by": user["id"],
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()

    if body.action == "approve":
        employee_resp = (
            supabase.table("hr_employees").select("email,first_name,last_name").eq("id", leave_request["employee_id"]).maybe_single().execute()
        )
        employee = maybe_single_data(employee_resp) or {}
        employee_name = f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip()
        email_service.notify_leave_approved(
            employee.get("email", ""), employee_name, leave_request["leave_type"],
            leave_request["start_date"], leave_request["end_date"],
        )

    return {"ok": True}


@router.get("/comp-off/{employee_id}")
def list_comp_off_ledger(employee_id: str, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    resp = (
        supabase.table("hr_comp_off_ledger")
        .select("*")
        .eq("employee_id", employee_id)
        .order("earned_date", desc=True)
        .execute()
    )
    return resp.data


@router.post("/comp-off/grant")
def grant_comp_off(body: CompOffGrant, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    """Manual grant only — the Comp-Off SOP requires HR to validate eligibility
    (biometric/manual log/Zoho/HOD confirmation) before issuing one, not an
    automatic issuance off the punch data."""
    if body.units not in (0.5, 1.0):
        raise HTTPException(status_code=400, detail="units must be 0.5 or 1.0")
    row = {
        "employee_id": body.employee_id,
        "earned_date": body.earned_date.isoformat(),
        "units": body.units,
        "expiry_date": (body.earned_date + timedelta(days=COMP_OFF_VALIDITY_DAYS)).isoformat(),
        "granted_by": user["id"],
    }
    existing = (
        supabase.table("hr_comp_off_ledger")
        .select("id")
        .eq("employee_id", body.employee_id)
        .eq("earned_date", row["earned_date"])
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="A Comp-Off has already been granted for that date")
    inserted = supabase.table("hr_comp_off_ledger").insert(row).execute()
    return inserted.data[0]


def fetch_approved_leaves(employee_id: str, year: int, month: int) -> dict[date, str]:
    """Used by the payroll engine — maps each day in an approved leave range to its leave_type."""
    from_d, to_d = pay_period_bounds(year, month)

    resp = (
        supabase.table("hr_leave_requests")
        .select("leave_type,start_date,end_date")
        .eq("employee_id", employee_id)
        .eq("status", "approved")
        .lte("start_date", to_d.isoformat())
        .gte("end_date", from_d.isoformat())
        .execute()
    )
    by_day = {}
    for r in resp.data:
        d = max(date.fromisoformat(r["start_date"]), from_d)
        end = min(date.fromisoformat(r["end_date"]), to_d)
        while d <= end:
            by_day[d] = r["leave_type"]
            d = date.fromordinal(d.toordinal() + 1)
    return by_day


def fetch_all_approved_leaves_by_employee(year: int, month: int) -> dict[str, dict[date, str]]:
    """One query for the whole month instead of one per employee (mirrors payroll.py's punch fetcher)."""
    from_d, to_d = pay_period_bounds(year, month)

    resp = (
        supabase.table("hr_leave_requests")
        .select("employee_id,leave_type,start_date,end_date")
        .eq("status", "approved")
        .lte("start_date", to_d.isoformat())
        .gte("end_date", from_d.isoformat())
        .execute()
    )
    by_employee: dict[str, dict[date, str]] = defaultdict(dict)
    for r in resp.data:
        d = max(date.fromisoformat(r["start_date"]), from_d)
        end = min(date.fromisoformat(r["end_date"]), to_d)
        while d <= end:
            by_employee[r["employee_id"]][d] = r["leave_type"]
            d = date.fromordinal(d.toordinal() + 1)
    return by_employee
