import base64
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_permission
from database import maybe_single_data, supabase
from models import AttendanceImportRequest, AttendanceOverrideUpsert, DisputeCreate, DisputePhotoUpload, DisputeResolve

router = APIRouter(prefix="/api", tags=["disputes"])

BUCKET = "dispute-photos"
# Same limit as the absence/onboarding uploads — comfortably under Vercel's
# serverless function request-body size limit once base64 inflation is accounted for.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024


@router.post("/disputes/upload")
def upload_photo(body: DisputePhotoUpload, user: dict = Depends(get_current_user)):
    try:
        raw = body.content_base64.split(",", 1)[-1]
        file_bytes = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file data")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large — please use a file under 4MB")

    now = datetime.now(timezone.utc)
    safe_name = body.filename.replace("/", "_").replace("\\", "_") or "file"
    path = f"{user['id']}/{now.strftime('%Y%m%d_%H%M%S')}_{now.microsecond}_{safe_name}"
    try:
        supabase.storage.from_(BUCKET).upload(path, file_bytes, {"content-type": body.content_type})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")
    return {"path": path, "filename": body.filename}


def _signed_urls(paths: list[str | None]) -> dict[str, str | None]:
    """One batched Storage call for every row's photo instead of a
    signed-URL round-trip per row."""
    unique_paths = [p for p in dict.fromkeys(paths) if p]
    if not unique_paths:
        return {}
    try:
        results = supabase.storage.from_(BUCKET).create_signed_urls(unique_paths, 3600)
        return {r["path"]: (r.get("signedURL") or r.get("signedUrl")) for r in results if not r.get("error")}
    except Exception:
        return {}


@router.post("/me/disputes")
def create_dispute(body: DisputeCreate, user: dict = Depends(get_current_user)):
    row = {
        "employee_id": user["id"],
        "date": body.date.isoformat(),
        "issue_type": body.issue_type,
        "claimed_in": body.claimed_in.isoformat() if body.claimed_in else None,
        "claimed_out": body.claimed_out.isoformat() if body.claimed_out else None,
        "reason": body.reason,
        "photo_path": body.photo_path,
        "photo_filename": body.photo_filename,
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
    urls = _signed_urls([r.get("photo_path") for r in resp.data])
    for r in resp.data:
        r["photo_url"] = urls.get(r.get("photo_path"))
    return resp.data


@router.get("/disputes")
def list_disputes(status: str | None = Query(None), admin: dict = Depends(require_permission("disputes.manage"))):
    query = supabase.table("hr_attendance_disputes").select(
        "*, hr_employees!hr_attendance_disputes_employee_id_fkey(first_name,last_name,employee_code,location)"
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("created_at", desc=True).execute()
    urls = _signed_urls([r.get("photo_path") for r in resp.data])
    for r in resp.data:
        r["photo_url"] = urls.get(r.get("photo_path"))
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


@router.put("/attendance-overrides/{employee_id}")
def upsert_attendance_override(
    employee_id: str, body: AttendanceOverrideUpsert, admin: dict = Depends(require_permission("disputes.manage"))
):
    """Direct attendance correction from the Attendance Report grid — same
    hr_attendance_overrides row a dispute approval writes (_apply_override in
    payroll.py reads both the same way), just without requiring the employee
    to have filed a dispute first."""
    if body.status_override not in ("present", "absent", "half_day"):
        raise HTTPException(status_code=400, detail="status_override must be 'present', 'absent', or 'half_day'")
    override_row = {
        "employee_id": employee_id,
        "date": body.date.isoformat(),
        "status_override": body.status_override,
        "first_in": body.first_in.isoformat() if body.first_in else None,
        "last_out": body.last_out.isoformat() if body.last_out else None,
        "note": body.note or "Manual correction",
        "created_by": admin["id"],
    }
    supabase.table("hr_attendance_overrides").upsert(override_row, on_conflict="employee_id,date").execute()
    return {"ok": True}


@router.post("/attendance-overrides/bulk-import")
def bulk_import_attendance(
    body: AttendanceImportRequest, admin: dict = Depends(require_permission("disputes.manage"))
):
    """Mass-correct/backfill many employees' daily attendance at once — e.g.
    for a unit/date range not covered by biometric sync, or a bulk
    reconciliation against a manual register — writing to the same
    hr_attendance_overrides row (on_conflict="employee_id,date") the
    single-cell edit above and dispute approvals write, so payroll/OT/leave
    recompute correctly off it afterward rather than needing a separate
    read path."""
    if not body.rows:
        raise HTTPException(status_code=400, detail="No rows to import")

    existing = supabase.table("hr_employees").select("id,employee_code").execute().data
    id_by_code = {e["employee_code"]: e["id"] for e in existing}

    imported, not_found, invalid_status = [], [], []
    rows_to_upsert = []
    for row in body.rows:
        emp_id = id_by_code.get(row.employee_code)
        if not emp_id:
            not_found.append(row.employee_code)
            continue
        if row.status_override not in ("present", "absent", "half_day"):
            invalid_status.append(f"{row.employee_code} ({row.date})")
            continue
        rows_to_upsert.append({
            "employee_id": emp_id,
            "date": row.date.isoformat(),
            "status_override": row.status_override,
            "first_in": row.first_in.isoformat() if row.first_in else None,
            "last_out": row.last_out.isoformat() if row.last_out else None,
            "note": row.note or "Bulk import",
            "created_by": admin["id"],
        })
        imported.append(f"{row.employee_code} ({row.date})")

    if rows_to_upsert:
        supabase.table("hr_attendance_overrides").upsert(rows_to_upsert, on_conflict="employee_id,date").execute()

    return {
        "imported": len(imported),
        "not_found": sorted(set(not_found)),
        "invalid_status": invalid_status,
    }
