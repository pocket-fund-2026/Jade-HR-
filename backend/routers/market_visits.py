"""Geotagged field/market-visit check-ins (e.g. sales/BD staff visiting
stores/markets) — a visit log, not an attendance mechanism. Per-employee
opt-in (`market_visit_checkin_enabled`, set by HR/admin), no notes field on
submission (kept minimal), no geofencing (lat/lng/accuracy logged as-is,
never verified against a known location). Reviewed by the employee's own
Reporting Manager, or Accounts/HR — mirrors routers/wfh.py's
_is_reporting_manager_of / my-team pattern exactly.
"""

import base64
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, my_report_ids, require_permission, user_can
from database import supabase
from workflow_log import record_step
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


PLACE_TYPES = ("market", "store", "factory", "office", "other")


def movement_for(employee_ids: list[str], days: list[str]) -> dict[tuple[str, str], list[dict]]:
    """Geotag check-ins by (employee_id, YYYY-MM-DD), for showing dispute reviewers
    where someone said they were. Best-effort: an error returns nothing rather than
    breaking the page that asks."""
    if not employee_ids or not days:
        return {}
    try:
        lo, hi = min(days), (date.fromisoformat(max(days)) + timedelta(days=1)).isoformat()
        rows = (
            supabase.table("hr_market_visits").select("*")
            .in_("employee_id", employee_ids).gte("captured_at", lo).lt("captured_at", hi)
            .order("captured_at").execute().data
        )
    except Exception:
        return {}
    out: dict[tuple[str, str], list[dict]] = {}
    for r in rows:
        out.setdefault((r["employee_id"], (r.get("captured_at") or "")[:10]), []).append({
            "visit_type": r.get("visit_type"), "place": r.get("place") or "", "place_type": r.get("place_type") or "market",
            "captured_at": r.get("captured_at"), "status": r.get("status"),
            "latitude": r.get("latitude"), "longitude": r.get("longitude"),
        })
    return out


def attach_movement(rows: list[dict]) -> None:
    """Adds `movement` (that employee's check-ins on the dispute's date) to dispute rows."""
    found = movement_for(list({r["employee_id"] for r in rows}), [str(r["date"])[:10] for r in rows])
    for r in rows:
        r["movement"] = found.get((r["employee_id"], str(r["date"])[:10]), [])


@router.get("/places")
def known_places(user: dict = Depends(get_current_user)):
    """Locations to pick from on the check-in card: every distinct work location on the roster."""
    rows = supabase.table("hr_employees").select("location").eq("is_active", True).execute().data
    return sorted({r["location"] for r in rows if r.get("location")})


@router.post("/bulk-enable")
def bulk_enable(body: dict, user: dict = Depends(require_permission("employees.manage"))):
    """Turn geotag check-in/check-out on (or off) for a whole group at once instead of
    person by person. Body: {"locations": ["Store A", ...] | null, "categories": ["factory_retail"] | null,
    "checkin": true, "checkout": true}. Matches everyone ACTIVE who fits ALL the given filters;
    needs at least one filter so a stray call can never flip the whole company."""
    locations, categories = body.get("locations") or None, body.get("categories") or None
    if not locations and not categories:
        raise HTTPException(status_code=400, detail="Give at least one location or category")
    q = supabase.table("hr_employees").select("id").eq("is_active", True)
    if locations:
        q = q.in_("location", locations)
    if categories:
        q = q.in_("employee_category", categories)
    ids = [r["id"] for r in q.execute().data]
    updates = {}
    if body.get("checkin") is not None:
        updates["market_visit_checkin_enabled"] = bool(body["checkin"])
    if body.get("checkout") is not None:
        updates["market_visit_checkout_enabled"] = bool(body["checkout"])
    if not updates:
        raise HTTPException(status_code=400, detail="Say whether to change checkin and/or checkout")
    for i in range(0, len(ids), 100):
        supabase.table("hr_employees").update(updates).in_("id", ids[i:i + 100]).execute()
    record_step("market_visit", None, "bulk_enable", user, basis={"count": len(ids), **updates, "locations": locations, "categories": categories})
    return {"updated": len(ids), **updates}


ENABLED_FLAG_BY_VISIT_TYPE = {
    "check_in": "market_visit_checkin_enabled",
    "check_out": "market_visit_checkout_enabled",
}


@router.post("")
def create_market_visit(body: MarketVisitCreate, user: dict = Depends(get_current_user)):
    flag = ENABLED_FLAG_BY_VISIT_TYPE.get(body.visit_type)
    if flag is None:
        raise HTTPException(status_code=400, detail="visit_type must be 'check_in' or 'check_out'")
    if not user.get(flag):
        raise HTTPException(status_code=403, detail=f"Market-visit {body.visit_type.replace('_', '-')} isn't enabled for this account")

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

    place_type = body.place_type if body.place_type in PLACE_TYPES else "market"
    row = {
        "employee_id": user["id"],
        "photo_path": path,
        "latitude": body.latitude,
        "longitude": body.longitude,
        "accuracy": body.accuracy,
        "captured_at": now.isoformat(),
        "status": "pending",
        "visit_type": body.visit_type,
    }
    try:
        inserted = supabase.table("hr_market_visits").insert({**row, "place_type": place_type, "place": body.place.strip()[:120]}).execute()
    except Exception as e:
        # sql/093 not applied yet: record the check-in without the place rather than lose it.
        if "place" not in str(e):
            raise
        inserted = supabase.table("hr_market_visits").insert(row).execute()
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
    report_ids = my_report_ids(user)
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
    record_step("market_visit", visit_id, body.action, user, employee_id=existing.data["employee_id"],
                note=body.note or "")
    return updated.data[0]
