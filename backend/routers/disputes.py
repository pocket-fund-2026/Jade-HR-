from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_permission
from database import maybe_single_data, supabase
from models import DisputeCreate, DisputeResolve

router = APIRouter(prefix="/api", tags=["disputes"])


@router.post("/me/disputes")
def create_dispute(body: DisputeCreate, user: dict = Depends(get_current_user)):
    row = {
        "employee_id": user["id"],
        "date": body.date.isoformat(),
        "issue_type": body.issue_type,
        "claimed_in": body.claimed_in.isoformat() if body.claimed_in else None,
        "claimed_out": body.claimed_out.isoformat() if body.claimed_out else None,
        "reason": body.reason,
    }
    inserted = supabase.table("hr_attendance_disputes").insert(row).execute()
    return inserted.data[0]


@router.get("/me/disputes")
def my_disputes(user: dict = Depends(get_current_user)):
    resp = (
        supabase.table("hr_attendance_disputes")
        .select("*")
        .eq("employee_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return resp.data


@router.get("/disputes")
def list_disputes(status: str | None = Query(None), admin: dict = Depends(require_permission("disputes.manage"))):
    query = supabase.table("hr_attendance_disputes").select(
        "*, hr_employees!hr_attendance_disputes_employee_id_fkey(first_name,last_name,employee_code,location)"
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("created_at", desc=True).execute()
    return resp.data


@router.put("/disputes/{dispute_id}")
def resolve_dispute(dispute_id: str, body: DisputeResolve, admin: dict = Depends(require_permission("disputes.manage"))):
    dispute_resp = supabase.table("hr_attendance_disputes").select("*").eq("id", dispute_id).maybe_single().execute()
    dispute = maybe_single_data(dispute_resp)
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if dispute["status"] != "pending":
        raise HTTPException(status_code=409, detail="Dispute already resolved")

    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("hr_attendance_disputes").update({
        "status": "approved" if body.action == "approve" else "rejected",
        "admin_note": body.admin_note,
        "resolved_by": admin["id"],
        "resolved_at": now,
    }).eq("id", dispute_id).execute()

    if body.action == "approve":
        first_in = (body.first_in or dispute.get("claimed_in"))
        last_out = (body.last_out or dispute.get("claimed_out"))
        override_row = {
            "employee_id": dispute["employee_id"],
            "date": dispute["date"],
            "status_override": body.status_override,
            "first_in": first_in.isoformat() if hasattr(first_in, "isoformat") else first_in,
            "last_out": last_out.isoformat() if hasattr(last_out, "isoformat") else last_out,
            "note": f"Approved dispute: {dispute['reason']}",
            "created_by": admin["id"],
        }
        supabase.table("hr_attendance_overrides").upsert(
            override_row, on_conflict="employee_id,date"
        ).execute()

    return {"ok": True}
