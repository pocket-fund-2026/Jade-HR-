"""Work From Home requests — Policy v3 §24-25 (source doc: "Attendance,
Punctuality, Leave & WFH Policy" v2.0).

WFH is not an entitlement: an employee files a request, but it only becomes
real WFH once BOTH a Senior-Management/HR-Head-level approver approves it
AND the employee's own Reporting Manager later confirms the assigned work
was actually completed (doc §25) — modelled here as two separate gated
steps, not one. Approval itself requires the dedicated `wfh.approve`
permission (sql/035_wfh_approve_permission.sql) — NOT the general
`leave.manage` permission ordinary HR staff already hold for leave/comp-off
matters. `wfh.approve` defaults to false for everyone; Accounts must
explicitly grant it via a per-person override to whoever actually holds
Senior-Management/HR-Head authority, since jade-hr has no separate role for
that tier. Viewing the queue (GET) stays available to `leave.manage` OR
`wfh.approve`, so ordinary HR can still see pending requests even if they
can't act on them. Completion confirmation is a separate, looser gate: the
employee's own reporting manager, or `leave.manage` as a fallback for
employees with no reporting manager on file.

This is a brand-new feature (no prior WFH concept existed in jade-hr).
Unlike the rest of Policy v3, it is NOT gated behind LATE_POLICY_V3_EFFECTIVE
— the user explicitly asked (2026-08-25) for the 50% pay treatment to be
wired live immediately, same as the late-arrival mechanics were separately
activated. An approved+confirmed request takes payroll effect for every date
in its start_date-end_date range as soon as both gates clear, regardless of
which pay-policy generation otherwise governs that cycle — see
fetch_confirmed_wfh_by_employee below, consumed by compute_monthly_summary's
new `wfh_days` param.
"""

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_permission, user_can
from database import supabase
from models import WFHCompletionConfirm, WFHRequestCreate, WFHResolve
from payroll import pay_period_bounds

router = APIRouter(prefix="/api/wfh-requests", tags=["wfh"])

PAY_TREATMENT_PERCENT = 50.0  # doc §25 — wired into payroll 2026-08-25


def _is_reporting_manager_of(user_id: str, employee_id: str) -> bool:
    employee = supabase.table("hr_employees").select("leave_approver_id").eq("id", employee_id).maybe_single().execute()
    if employee.data and employee.data.get("leave_approver_id") == user_id:
        return True
    profile = (
        supabase.table("hr_employee_profile").select("reporting_to_id")
        .eq("employee_id", employee_id).maybe_single().execute()
    )
    data = profile.data if profile else None
    return bool(data and data.get("reporting_to_id") == user_id)


@router.post("")
def create_wfh_request(body: WFHRequestCreate, user: dict = Depends(get_current_user)):
    if body.end_date < body.start_date:
        raise HTTPException(status_code=400, detail="end_date must be on/after start_date")
    row = {
        "employee_id": user["id"],
        "start_date": body.start_date.isoformat(),
        "end_date": body.end_date.isoformat(),
        "reason": body.reason,
        "status": "pending",
    }
    inserted = supabase.table("hr_wfh_requests").insert(row).execute()
    return inserted.data[0]


EMPLOYEE_JOIN = "*, hr_employees!hr_wfh_requests_employee_id_fkey(first_name,last_name,employee_code,location)"


@router.get("/mine")
def my_wfh_requests(user: dict = Depends(get_current_user)):
    resp = (
        supabase.table("hr_wfh_requests").select("*")
        .eq("employee_id", user["id"]).order("start_date", desc=True).execute()
    )
    return resp.data


@router.get("")
def list_wfh_requests(status: str | None = None, user: dict = Depends(require_permission("leave.manage", "wfh.approve"))):
    q = supabase.table("hr_wfh_requests").select(EMPLOYEE_JOIN).order("start_date", desc=True)
    if status:
        q = q.eq("status", status)
    return q.execute().data


@router.get("/my-team")
def my_team_wfh_requests(status: str | None = None, user: dict = Depends(get_current_user)):
    """WFH requests from anyone who lists this user as their leave approver OR
    reporting manager — mirrors routers/leave.py's /me/team-leave-requests.
    Primarily for the completion-confirmation step (doc §25): an approved
    request awaiting its Reporting Manager's confirmation shows up here."""
    direct_resp = supabase.table("hr_employees").select("id").eq("leave_approver_id", user["id"]).execute()
    reporting_resp = supabase.table("hr_employee_profile").select("employee_id").eq("reporting_to_id", user["id"]).execute()
    report_ids = list({r["id"] for r in direct_resp.data} | {r["employee_id"] for r in reporting_resp.data})
    if not report_ids:
        return []
    q = supabase.table("hr_wfh_requests").select(EMPLOYEE_JOIN).in_("employee_id", report_ids)
    if status:
        q = q.eq("status", status)
    return q.order("start_date", desc=True).execute().data


@router.post("/{request_id}/resolve")
def resolve_wfh_request(request_id: str, body: WFHResolve, user: dict = Depends(require_permission("wfh.approve"))):
    """Senior Management / HR Head approval step (doc §24)."""
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    existing = supabase.table("hr_wfh_requests").select("*").eq("id", request_id).maybe_single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="WFH request not found")
    if existing.data["status"] != "pending":
        raise HTTPException(status_code=409, detail="This request has already been resolved")
    updated = supabase.table("hr_wfh_requests").update({
        "status": "approved" if body.action == "approve" else "rejected",
        "resolved_by": user["id"],
        "resolved_at": datetime.now().isoformat(),
        "resolution_note": body.note,
        "pay_treatment_percent": PAY_TREATMENT_PERCENT if body.action == "approve" else None,
    }).eq("id", request_id).execute()
    return updated.data[0]


@router.post("/{request_id}/confirm-completion")
def confirm_completion(
    request_id: str, body: WFHCompletionConfirm, user: dict = Depends(get_current_user),
):
    """Reporting Manager confirms the assigned work was actually done (doc
    §25) — gates whether the approved WFH day is honoured or falls back to
    the normal attendance/leave rules. HR (`leave.manage`) can also confirm,
    for cases with no reporting manager on file."""
    request = supabase.table("hr_wfh_requests").select("*").eq("id", request_id).maybe_single().execute()
    if not request.data:
        raise HTTPException(status_code=404, detail="WFH request not found")
    if request.data["status"] != "approved":
        raise HTTPException(status_code=409, detail="Only an approved WFH request can have its completion confirmed")
    if not (_is_reporting_manager_of(user["id"], request.data["employee_id"]) or user_can(user, "leave.manage")):
        raise HTTPException(status_code=403, detail="Only the employee's Reporting Manager or HR can confirm this")
    updated = supabase.table("hr_wfh_requests").update({
        "work_completed": body.confirmed,
        "work_completed_confirmed_by": user["id"],
        "work_completed_confirmed_at": datetime.now().isoformat(),
        "completion_note": body.note,
    }).eq("id", request_id).execute()
    return updated.data[0]


# ── Payroll wiring ───────────────────────────────────────────────────────────
# Mirrors routers/leave.py's fetch_approved_leaves / fetch_all_approved_leaves_by_employee
# shape exactly — same "one query, expand start/end into a per-day dict"
# pattern, kept at this router layer so payroll.py never queries the DB
# itself (same separation overrides/leaves already follow).

def fetch_confirmed_wfh(
    employee_id: str, year: int, month: int, date_range: tuple[date, date] | None = None,
) -> dict[date, dict]:
    """Every date in an approved-AND-completion-confirmed WFH request that
    overlaps this pay period, mapped to that request row. A request that is
    still pending, was rejected, or was approved but not yet confirmed (or
    confirmed False) is deliberately excluded — those days fall back to
    normal attendance/leave rules, per doc §25."""
    from_d, to_d = date_range if date_range else pay_period_bounds(year, month)
    resp = (
        supabase.table("hr_wfh_requests")
        .select("id,start_date,end_date,pay_treatment_percent")
        .eq("employee_id", employee_id)
        .eq("status", "approved")
        .eq("work_completed", True)
        .lte("start_date", to_d.isoformat())
        .gte("end_date", from_d.isoformat())
        .execute()
    )
    by_day: dict[date, dict] = {}
    for r in resp.data:
        d = max(date.fromisoformat(r["start_date"]), from_d)
        end = min(date.fromisoformat(r["end_date"]), to_d)
        while d <= end:
            by_day[d] = r
            d += timedelta(days=1)
    return by_day


def fetch_all_confirmed_wfh_by_employee(
    year: int, month: int, calendar_month: bool = False, date_range: tuple[date, date] | None = None,
) -> dict[str, dict[date, dict]]:
    """Bulk version of fetch_confirmed_wfh — one query for the whole pay
    period instead of one per employee, mirroring
    fetch_all_approved_leaves_by_employee in routers/leave.py."""
    from_d, to_d = date_range if date_range else pay_period_bounds(year, month, calendar_month)
    resp = (
        supabase.table("hr_wfh_requests")
        .select("employee_id,start_date,end_date,pay_treatment_percent")
        .eq("status", "approved")
        .eq("work_completed", True)
        .lte("start_date", to_d.isoformat())
        .gte("end_date", from_d.isoformat())
        .execute()
    )
    by_employee: dict[str, dict[date, dict]] = {}
    for r in resp.data:
        d = max(date.fromisoformat(r["start_date"]), from_d)
        end = min(date.fromisoformat(r["end_date"]), to_d)
        bucket = by_employee.setdefault(r["employee_id"], {})
        while d <= end:
            bucket[d] = r
            d += timedelta(days=1)
    return by_employee
