import base64
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

import email_service
from auth import get_current_user, require_permission
from database import maybe_single_data, supabase
from models import AbsenceRequestCreate, AbsenceResolve, AbsenceUpload

router = APIRouter(tags=["absence"])

BUCKET = "absence-attachments"
# Same limit as the onboarding upload — comfortably under Vercel's serverless
# function request-body size limit once base64 inflation is accounted for.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024


@router.post("/api/absence-requests/upload")
def upload_attachment(body: AbsenceUpload, user: dict = Depends(get_current_user)):
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
    """One batched Storage call for every row's attachment instead of a
    signed-URL round-trip per row."""
    unique_paths = [p for p in dict.fromkeys(paths) if p]
    if not unique_paths:
        return {}
    try:
        results = supabase.storage.from_(BUCKET).create_signed_urls(unique_paths, 3600)
        return {r["path"]: (r.get("signedURL") or r.get("signedUrl")) for r in results if not r.get("error")}
    except Exception:
        return {}


@router.post("/api/me/absence-requests")
def create_absence_request(body: AbsenceRequestCreate, user: dict = Depends(get_current_user)):
    if body.end_date < body.start_date:
        raise HTTPException(status_code=400, detail="End date must be on or after start date")

    row = {
        "employee_id": user["id"],
        "department": body.department or user.get("department", ""),
        "employee_code": user["employee_code"],
        "first_name": user["first_name"],
        "last_name": user.get("last_name", ""),
        "email": user.get("email", ""),
        "start_date": body.start_date.isoformat(),
        "end_date": body.end_date.isoformat(),
        "number_of_days": body.number_of_days,
        "details": body.details,
        "approver_name": body.approver_name,
        "approver_email": body.approver_email,
        "attachment_path": body.attachment_path,
        "attachment_filename": body.attachment_filename,
    }
    inserted = supabase.table("hr_absence_requests").insert(row).execute()

    if body.save_approver:
        supabase.table("hr_employee_profile").upsert(
            {
                "employee_id": user["id"],
                "reporting_to": body.approver_name,
                "reporting_to_email": body.approver_email,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="employee_id",
        ).execute()

    employee_name = f"{user['first_name']} {user.get('last_name', '')}".strip()
    email_service.notify_absence_submitted(
        employee_name, row["department"], body.start_date.isoformat(), body.end_date.isoformat(),
        body.number_of_days, body.details, body.approver_email, email_service.HR_NOTIFY_EMAIL,
    )

    return inserted.data[0]


@router.get("/api/me/absence-requests")
def my_absence_requests(user: dict = Depends(get_current_user)):
    resp = (
        supabase.table("hr_absence_requests")
        .select("*")
        .eq("employee_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    urls = _signed_urls([r.get("attachment_path") for r in resp.data])
    for r in resp.data:
        r["attachment_url"] = urls.get(r.get("attachment_path"))
    return resp.data


@router.get("/api/absence-requests")
def list_absence_requests(status: str | None = None, user: dict = Depends(require_permission("absence.manage"))):
    query = supabase.table("hr_absence_requests").select(
        "*, hr_employees!hr_absence_requests_employee_id_fkey(first_name,last_name,employee_code,location)"
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("created_at", desc=True).execute()
    urls = _signed_urls([r.get("attachment_path") for r in resp.data])
    for r in resp.data:
        r["attachment_url"] = urls.get(r.get("attachment_path"))
    return resp.data


@router.put("/api/absence-requests/{request_id}")
def resolve_absence_request(
    request_id: str, body: AbsenceResolve, user: dict = Depends(require_permission("absence.manage"))
):
    existing = supabase.table("hr_absence_requests").select("*").eq("id", request_id).maybe_single().execute()
    absence_request = maybe_single_data(existing)
    if not absence_request:
        raise HTTPException(status_code=404, detail="Absence request not found")
    if absence_request["status"] != "pending":
        raise HTTPException(status_code=409, detail="Absence request already resolved")
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    status = "approved" if body.action == "approve" else "rejected"
    supabase.table("hr_absence_requests").update({
        "status": status,
        "admin_note": body.admin_note,
        "resolved_by": user["id"],
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()

    employee_name = f"{absence_request.get('first_name', '')} {absence_request.get('last_name', '')}".strip()
    email_service.notify_absence_resolved(
        absence_request.get("email", ""), employee_name, status,
        absence_request["start_date"], absence_request["end_date"], body.admin_note,
    )

    return {"ok": True}
