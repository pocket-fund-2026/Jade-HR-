import base64
from datetime import datetime, timezone
from datetime import time as time_type

from fastapi import APIRouter, Depends, HTTPException

from auth import CONSOLE_ROLES, get_current_user, require_permission, user_can
from database import maybe_single_data, supabase
from paging import ContextThreadPoolExecutor
from payroll import register_time_slot
from models import EmployeeDocumentUpload, EmployeeProfileUpdate, ShiftTimingSet

import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/employees", tags=["employee-profile"])

DOCS_BUCKET = "employee-documents"
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
DOC_TYPE_PATH_FIELD = {"aadhar": "aadhar_card_path", "pan": "pan_card_path"}

# Bank/compliance-ID fields — gated by salary.view the same way employees.py's
# SALARY_FIELDS are, since they're just as sensitive as pay figures. The
# scanned Aadhaar/PAN images are just as sensitive as the numbers themselves.
SENSITIVE_PROFILE_FIELDS = (
    "bank_name", "bank_account_no", "bank_ifsc", "pan_no", "uan_no", "aadhar_no", "pf_no", "esic_no",
    "aadhar_card_path", "pan_card_path",
)


def _require_view_access(employee_id: str, user: dict) -> None:
    if user["id"] != employee_id:
        if user["role"] not in CONSOLE_ROLES or not user_can(user, "employees.view"):
            raise HTTPException(status_code=403, detail="Not authorized")


def _sanitize_profile(profile: dict, employee_id: str, user: dict) -> dict:
    # Self-view always sees your own bank/compliance numbers; anyone viewing
    # someone else's profile without salary.view gets those fields stripped —
    # mirrors routers/employees.py's _sanitize().
    if user["id"] != employee_id and not user_can(user, "salary.view"):
        for field in SENSITIVE_PROFILE_FIELDS:
            profile.pop(field, None)
        profile.pop("aadhar_card_url", None)
        profile.pop("pan_card_url", None)
    return profile


def _signed_url(path: str | None) -> str | None:
    if not path:
        return None
    try:
        resp = supabase.storage.from_(DOCS_BUCKET).create_signed_url(path, 3600)
        return resp.get("signedURL") or resp.get("signed_url")
    except Exception:
        return None


def _employee_exists(employee_id: str) -> bool:
    resp = supabase.table("hr_employees").select("id").eq("id", employee_id).maybe_single().execute()
    return bool(maybe_single_data(resp))


@router.get("/{employee_id}/profile")
def get_employee_profile(employee_id: str, user: dict = Depends(get_current_user)):
    _require_view_access(employee_id, user)
    # 3 independent reads — fires on every Employee Details page view, so
    # run them concurrently instead of one after another.
    with ContextThreadPoolExecutor(max_workers=3) as pool:
        exists_future = pool.submit(_employee_exists, employee_id)
        profile_future = pool.submit(
            lambda: supabase.table("hr_employee_profile")
            .select("*").eq("employee_id", employee_id).maybe_single().execute()
        )
        udf_future = pool.submit(
            lambda: supabase.table("hr_employee_udf")
            .select("*").eq("employee_id", employee_id).order("position").execute()
        )
        exists = exists_future.result()
        profile_resp = profile_future.result()
        udf_resp = udf_future.result()

    if not exists:
        raise HTTPException(status_code=404, detail="Employee not found")

    profile = maybe_single_data(profile_resp) or {"employee_id": employee_id}
    profile["udfs"] = [{"udf_name": r["udf_name"], "udf_value": r["udf_value"]} for r in udf_resp.data]
    profile["aadhar_card_url"] = _signed_url(profile.get("aadhar_card_path"))
    profile["pan_card_url"] = _signed_url(profile.get("pan_card_path"))
    return _sanitize_profile(profile, employee_id, user)


@router.post("/{employee_id}/documents/upload")
def upload_employee_document(
    employee_id: str, body: EmployeeDocumentUpload, user: dict = Depends(require_permission("employees.manage"))
):
    """Central storage for an existing employee's Aadhaar/PAN scan — replaces
    keeping these on HR's local PC. Same private-bucket-with-signed-URL
    pattern as onboarding-documents; access to the resulting URL is gated
    exactly like the aadhar_no/pan_no text fields (see SENSITIVE_PROFILE_FIELDS
    above)."""
    if body.doc_type not in DOC_TYPE_PATH_FIELD:
        raise HTTPException(status_code=400, detail="doc_type must be 'aadhar' or 'pan'")
    if not _employee_exists(employee_id):
        raise HTTPException(status_code=404, detail="Employee not found")

    try:
        raw = body.content_base64.split(",", 1)[-1]
        file_bytes = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file data")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large — please use a file under 4MB")

    now = datetime.now(timezone.utc)
    safe_name = body.filename.replace("/", "_").replace("\\", "_") or "file"
    path = f"{employee_id}/{body.doc_type}_{now.strftime('%Y%m%d_%H%M%S')}_{safe_name}"
    try:
        supabase.storage.from_(DOCS_BUCKET).upload(path, file_bytes, {"content-type": body.content_type})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")

    path_field = DOC_TYPE_PATH_FIELD[body.doc_type]
    supabase.table("hr_employee_profile").upsert(
        {"employee_id": employee_id, path_field: path, "updated_at": now.isoformat()},
        on_conflict="employee_id",
    ).execute()

    return {"path": path, "url": _signed_url(path)}


@router.put("/{employee_id}/profile")
def update_employee_profile(
    employee_id: str, body: EmployeeProfileUpdate, user: dict = Depends(require_permission("employees.manage"))
):
    if not _employee_exists(employee_id):
        raise HTTPException(status_code=404, detail="Employee not found")

    updates = body.model_dump(exclude_unset=True, exclude={"udfs"})
    # The edit form always round-trips every profile field, including these —
    # for an editor who can't see someone else's bank/compliance numbers (GET
    # above already blanks them out), that would silently overwrite the real
    # values with empty strings. Drop them from the write instead, same as
    # employees.py's update_employee does for SALARY_FIELDS.
    if employee_id != user["id"] and not user_can(user, "salary.view"):
        for field in SENSITIVE_PROFILE_FIELDS:
            updates.pop(field, None)
    for date_field in (
        "date_of_birth", "probation_completion_date", "confirmation_date", "last_promotion_date",
        "next_promotion_date", "gratuity_date", "transfer_date", "marriage_date", "retirement_date",
        "contract_start_date", "contract_end_date", "last_reappointment_date", "last_exit_date_rejoinee",
        "scheduled_exit_date", "exit_date", "settlement_date", "epf_join_date", "eps_join_date", "eps_exit_date",
    ):
        if date_field in updates and updates[date_field] is not None:
            updates[date_field] = updates[date_field].isoformat()

    if "reporting_to_id" in updates:
        updates["reporting_to_id"] = updates["reporting_to_id"] or None

    if updates:
        updates["employee_id"] = employee_id
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase.table("hr_employee_profile").upsert(updates, on_conflict="employee_id").execute()

    # Marked as Exited by hand (no Initiate Exit): still tell HR to revoke access.
    if updates.get("employee_status") == "Exited":
        try:
            from routers.exit_procedure import send_access_revocation_if_new
            send_access_revocation_if_new(employee_id, str(updates.get("exit_date") or datetime.now(timezone.utc).date()), "left")
        except Exception:
            logger.exception("Could not send leaver access email for %s", employee_id)

    if body.udfs is not None:
        supabase.table("hr_employee_udf").delete().eq("employee_id", employee_id).execute()
        rows = [
            {"employee_id": employee_id, "udf_name": u.udf_name, "udf_value": u.udf_value, "position": i}
            for i, u in enumerate(body.udfs)
            if u.udf_name or u.udf_value
        ]
        if rows:
            supabase.table("hr_employee_udf").insert(rows).execute()

    return get_employee_profile(employee_id, user)


def _slot_label(start: time_type, end: time_type) -> str:
    """"10:30 AM – 7:30 PM" — the label format payroll's _slot_times() parses."""
    def one(t: time_type) -> str:
        return f"{(t.hour % 12) or 12}:{t.minute:02d} {'AM' if t.hour < 12 else 'PM'}"
    return f"{one(start)} \u2013 {one(end)}"


@router.post("/{employee_id}/shift-timing")
def set_shift_timing(
    employee_id: str, body: ShiftTimingSet, user: dict = Depends(require_permission("employees.manage"))
):
    """HR types this person's own In and Out time. The matching time slot
    ("10:30 AM – 7:30 PM") is created if it doesn't exist yet and assigned to
    the employee, so late grading, standard hours and OT all follow it."""
    if not _employee_exists(employee_id):
        raise HTTPException(status_code=404, detail="Employee not found")
    if body.end_time <= body.start_time:
        raise HTTPException(status_code=400, detail="Out time must be after In time")
    label = _slot_label(body.start_time, body.end_time)
    existing = supabase.table("hr_time_slots").select("id").eq("label", label).limit(1).execute().data
    if not existing:
        last = supabase.table("hr_time_slots").select("sort_order").order("sort_order", desc=True).limit(1).execute().data
        supabase.table("hr_time_slots").insert({
            "label": label,
            "shift_start": body.start_time.replace(second=0, microsecond=0).isoformat(),
            "sort_order": ((last[0]["sort_order"] if last else 0) or 0) + 1,
        }).execute()
    register_time_slot(label, body.start_time.replace(second=0, microsecond=0))
    supabase.table("hr_employee_profile").upsert(
        {"employee_id": employee_id, "time_slot": label, "updated_at": datetime.now(timezone.utc).isoformat()},
        on_conflict="employee_id",
    ).execute()
    logger.info("shift timing for %s set to %s by %s", employee_id, label, user.get("employee_code"))
    return {"time_slot": label}
