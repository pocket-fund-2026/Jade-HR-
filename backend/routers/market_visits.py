"""Geotagged field/market-visit check-ins (e.g. sales/BD staff visiting
stores/markets) — a visit log, not an attendance mechanism. Per-employee
opt-in (`market_visit_checkin_enabled`, set by HR/admin), no notes field on
submission (kept minimal), no geofencing (lat/lng/accuracy logged as-is,
never verified against a known location). Reviewed by the employee's own
Reporting Manager, or Accounts/HR — mirrors routers/wfh.py's
_is_reporting_manager_of / my-team pattern exactly.
"""

import base64
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, require_permission, user_can
from database import supabase
from models import MarketVisitCreate, MarketVisitResolve

router = APIRouter(prefix="/api/market-visits", tags=["market-visits"])

BUCKET = "market-visit-photos"
EMPLOYEE_JOIN = "*, hr_employees!hr_market_visits_employee_id_fkey(first_name,last_name,employee_code,location)"


def _signed_urls(paths: list[str | None]) -> dict[str, str | None]:
    unique_paths = [p for p in set(paths) if p]
    if not unique_paths:
        return {}
    try:
        results = supabase.storage.from_(BUCKET).create_signed_urls(unique_paths, 3600)
        return {r["path"]: (r.get("signedURL") or r.get("signedUrl")) for r in results if not r.get("error")}
    except Exception:
        return {}


def _with_photo_urls(rows: list[dict]) -> list[dict]:
    urls = _signed_urls([r.get("photo_path") for r in rows])
    for r in rows:
        r["photo_url"] = urls.get(r.get("photo_path"))
    return rows


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
def create_market_visit(body: MarketVisitCreate, user: dict = Depends(get_current_user)):
    if not user.get("market_visit_checkin_enabled"):
        raise HTTPException(status_code=403, detail="Market-visit check-in isn't enabled for this account")

    try:
        raw = body.photo_base64.split(",", 1)[-1]
        photo_bytes = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid photo data")
    if len(photo_bytes) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo too large")

    now = datetime.now()
    path = f"{user['employee_code']}/{now.strftime('%Y%m%d_%H%M%S')}.jpg"
    try:
        supabase.storage.from_(BUCKET).upload(path, photo_bytes, {"content-type": "image/jpeg"})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Photo upload failed: {e}")

    inserted = supabase.table("hr_market_visits").insert({
        "employee_id": user["id"],
        "photo_path": path,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "accuracy": body.accuracy,
        "captured_at": now.isoformat(),
        "status": "pending",
    }).execute()
    return inserted.data[0]


@router.get("/mine")
def my_market_visits(user: dict = Depends(get_current_user)):
    resp = (
        supabase.table("hr_market_visits").select("*")
        .eq("employee_id", user["id"]).order("captured_at", desc=True).execute()
    )
    return _with_photo_urls(resp.data)


@router.get("")
def list_market_visits(status: str | None = None, user: dict = Depends(require_permission("market_visits.review"))):
    q = supabase.table("hr_market_visits").select(EMPLOYEE_JOIN).order("captured_at", desc=True)
    if status:
        q = q.eq("status", status)
    return _with_photo_urls(q.execute().data)


@router.get("/my-team")
def my_team_market_visits(status: str | None = None, user: dict = Depends(get_current_user)):
    """Market-visit check-ins from anyone who lists this user as their leave
    approver OR reporting manager — mirrors routers/wfh.py's /my-team."""
    direct_resp = supabase.table("hr_employees").select("id").eq("leave_approver_id", user["id"]).execute()
    reporting_resp = supabase.table("hr_employee_profile").select("employee_id").eq("reporting_to_id", user["id"]).execute()
    report_ids = list({r["id"] for r in direct_resp.data} | {r["employee_id"] for r in reporting_resp.data})
    if not report_ids:
        return []
    q = supabase.table("hr_market_visits").select(EMPLOYEE_JOIN).in_("employee_id", report_ids)
    if status:
        q = q.eq("status", status)
    return _with_photo_urls(q.order("captured_at", desc=True).execute().data)


@router.post("/{visit_id}/resolve")
def resolve_market_visit(visit_id: str, body: MarketVisitResolve, user: dict = Depends(get_current_user)):
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    existing = supabase.table("hr_market_visits").select("*").eq("id", visit_id).maybe_single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Market visit not found")
    if existing.data["status"] != "pending":
        raise HTTPException(status_code=409, detail="This check-in has already been resolved")
    if not (_is_reporting_manager_of(user["id"], existing.data["employee_id"]) or user_can(user, "market_visits.review")):
        raise HTTPException(status_code=403, detail="Only the employee's Reporting Manager or HR can resolve this")
    updated = supabase.table("hr_market_visits").update({
        "status": "approved" if body.action == "approve" else "rejected",
        "reviewed_by": user["id"],
        "reviewed_at": datetime.now().isoformat(),
        "review_note": body.note,
    }).eq("id", visit_id).execute()
    return updated.data[0]
