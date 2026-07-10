from collections import defaultdict
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_permission
from database import supabase
from models import LeaveRequestCreate, LeaveResolve
from payroll import pay_period_bounds

router = APIRouter(prefix="/api", tags=["leave"])

# Fixed annual allocations, enforced in code rather than a balances table.
# Unpaid leave has no cap.
LEAVE_ALLOCATIONS = {"casual": 12, "sick": 12, "earned": 15}


def _days_in_range(start: str, end: str) -> int:
    return (date.fromisoformat(end) - date.fromisoformat(start)).days + 1


@router.post("/me/leave-requests")
def create_leave_request(body: LeaveRequestCreate, user: dict = Depends(get_current_user)):
    if body.end_date < body.start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")
    row = {
        "employee_id": user["id"],
        "leave_type": body.leave_type,
        "start_date": body.start_date.isoformat(),
        "end_date": body.end_date.isoformat(),
        "reason": body.reason,
    }
    inserted = supabase.table("hr_leave_requests").insert(row).execute()
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

    uncapped = ["unpaid", "other"]
    return [
        {"leave_type": t, "allocated": allocated, "used": used.get(t, 0), "remaining": allocated - used.get(t, 0)}
        for t, allocated in LEAVE_ALLOCATIONS.items()
    ] + [{"leave_type": t, "allocated": None, "used": used.get(t, 0), "remaining": None} for t in uncapped]


@router.get("/leave-requests")
def list_leave_requests(status: str | None = Query(None), admin: dict = Depends(require_permission("leave.manage"))):
    query = supabase.table("hr_leave_requests").select(
        "*, hr_employees!hr_leave_requests_employee_id_fkey(first_name,last_name,employee_code,location)"
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("created_at", desc=True).execute()
    return resp.data


@router.put("/leave-requests/{request_id}")
def resolve_leave_request(request_id: str, body: LeaveResolve, admin: dict = Depends(require_permission("leave.manage"))):
    existing = supabase.table("hr_leave_requests").select("*").eq("id", request_id).maybe_single().execute()
    leave_request = existing.data
    if not leave_request:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if leave_request["status"] != "pending":
        raise HTTPException(status_code=409, detail="Leave request already resolved")
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    supabase.table("hr_leave_requests").update({
        "status": "approved" if body.action == "approve" else "rejected",
        "admin_note": body.admin_note,
        "resolved_by": admin["id"],
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()

    return {"ok": True}


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
