import base64
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

import email_service
from auth import hash_password, require_permission, user_can
from database import maybe_single_data, supabase
from models import OnboardingResolve, OnboardingSubmissionCreate, OnboardingUpload

router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])

BUCKET = "onboarding-documents"
# Kept comfortably under Vercel's serverless function request-body limit —
# base64 inflates this ~33% before it even reaches the JSON envelope.
MAX_UPLOAD_BYTES = 4 * 1024 * 1024

DATE_FIELDS = ("date_of_birth", "date_of_joining", "date_of_offer_letter")

# Compensation + bank fields — gated by salary.view the same way
# routers/employees.py's SALARY_FIELDS are; the salary-slip uploads are
# just as sensitive so their signed URLs are withheld alongside these.
SENSITIVE_SUBMISSION_FIELDS = (
    "basic", "hra", "conveyance", "other_allowance", "monthly_ctc",
    "bank_name", "bank_account_no", "bank_ifsc",
)


@router.post("/upload")
def upload_document(body: OnboardingUpload):
    """Public — a new joinee has no login yet. Called once per file from the
    onboarding form rather than bundling every file into the final submit
    payload, so one large photo never risks blowing past the request body
    size limit. Mirrors routers/selfie.py's base64-in-JSON upload pattern."""
    try:
        raw = body.content_base64.split(",", 1)[-1]
        file_bytes = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file data")
    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File too large — please use an image under 4MB")

    now = datetime.now(timezone.utc)
    safe_name = body.filename.replace("/", "_").replace("\\", "_") or "file"
    path = f"{now.strftime('%Y%m%d_%H%M%S')}_{now.microsecond}_{safe_name}"
    try:
        supabase.storage.from_(BUCKET).upload(path, file_bytes, {"content-type": body.content_type})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")
    return {"path": path}


@router.post("/submit")
def submit_onboarding(body: OnboardingSubmissionCreate):
    """Public — the new-joinee-details form (replaces the external Zoho
    form). Lands in the review queue below; never writes to hr_employees/
    hr_employee_profile directly — see resolve_submission for that."""
    row = body.model_dump()
    for date_field in DATE_FIELDS:
        if row[date_field] is not None:
            row[date_field] = row[date_field].isoformat()
    row["status"] = "pending"
    row["submitted_at"] = datetime.now(timezone.utc).isoformat()
    inserted = supabase.table("hr_onboarding_submissions").insert(row).execute()
    email_service.notify_onboarding_submitted(row, email_service.HR_NOTIFY_EMAIL)
    return {"id": inserted.data[0]["id"]}


def _signed_url(path: str | None) -> str | None:
    if not path:
        return None
    try:
        resp = supabase.storage.from_(BUCKET).create_signed_url(path, 3600)
        return resp.get("signedURL") or resp.get("signed_url")
    except Exception:
        return None


def _with_signed_urls(submission: dict, include_salary_slips: bool = True) -> dict:
    submission["aadhar_front_url"] = _signed_url(submission.get("aadhar_front_path"))
    submission["aadhar_back_url"] = _signed_url(submission.get("aadhar_back_path"))
    submission["pan_card_url"] = _signed_url(submission.get("pan_card_path"))
    submission["salary_slip_urls"] = [
        u for u in (_signed_url(p) for p in submission.get("salary_slip_paths") or []) if u
    ] if include_salary_slips else []
    return submission


def _sanitize_submission(submission: dict, user: dict) -> dict:
    # No self-view exception here — a submission isn't a logged-in employee
    # yet, just a candidate record; only salary.view unlocks the compensation
    # figures and bank details, same as everywhere else in this app.
    if not user_can(user, "salary.view"):
        for field in SENSITIVE_SUBMISSION_FIELDS:
            submission.pop(field, None)
        submission.pop("salary_slip_paths", None)
    return submission


@router.get("/submissions")
def list_submissions(status: str | None = None, user: dict = Depends(require_permission("onboarding.manage"))):
    query = supabase.table("hr_onboarding_submissions").select(
        "id,status,submitted_at,full_name,designation,department,place_of_work,date_of_joining,"
        "admin_note,resolved_at,created_employee_id"
    )
    if status:
        query = query.eq("status", status)
    resp = query.order("submitted_at", desc=True).execute()
    return resp.data


@router.get("/submissions/{submission_id}")
def get_submission(submission_id: str, user: dict = Depends(require_permission("onboarding.manage"))):
    resp = supabase.table("hr_onboarding_submissions").select("*").eq("id", submission_id).maybe_single().execute()
    submission = maybe_single_data(resp)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    can_view_salary = user_can(user, "salary.view")
    submission = _with_signed_urls(submission, include_salary_slips=can_view_salary)
    return _sanitize_submission(submission, user)


def _create_employee_from_submission(submission: dict, body: OnboardingResolve) -> str:
    existing = supabase.table("hr_employees").select("id").eq("employee_code", body.employee_code).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Employee code already exists")

    first_name, _, last_name = submission.get("full_name", "").strip().partition(" ")
    employee_row = {
        "employee_code": body.employee_code,
        "first_name": first_name or submission.get("full_name", ""),
        "last_name": last_name,
        "designation": submission.get("designation", ""),
        "department": submission.get("department", ""),
        "location": submission.get("place_of_work") or "Madhu Estate, Mumbai",
        "date_of_joining": submission.get("date_of_joining"),
        "basic": submission.get("basic", 0),
        "hra": submission.get("hra", 0),
        "conveyance": submission.get("conveyance", 0),
        "other_allowance": submission.get("other_allowance", 0),
        "phone": submission.get("mobile", ""),
        "email": submission.get("email", ""),
        "role": "employee",
        "employee_category": body.employee_category,
        "password_hash": hash_password(body.password),
    }
    inserted = supabase.table("hr_employees").insert(employee_row).execute()
    employee_id = inserted.data[0]["id"]

    address = "\n".join(
        line for line in (
            submission.get("address_line1", ""), submission.get("address_line2", ""),
            submission.get("address_line3", ""), submission.get("address_line4", ""),
        ) if line
    )
    profile_row = {
        "employee_id": employee_id,
        "date_of_birth": submission.get("date_of_birth"),
        "aadhar_no": submission.get("aadhar_no", ""),
        "pan_no": submission.get("pan_no", ""),
        "bank_name": submission.get("bank_name", ""),
        "bank_account_no": submission.get("bank_account_no", ""),
        "bank_ifsc": submission.get("bank_ifsc", ""),
        "emergency_contact_no": submission.get("emergency_contact_no", ""),
        "permanent_address": address,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("hr_employee_profile").upsert(profile_row, on_conflict="employee_id").execute()
    return employee_id


@router.put("/submissions/{submission_id}")
def resolve_submission(
    submission_id: str, body: OnboardingResolve, user: dict = Depends(require_permission("onboarding.manage"))
):
    resp = supabase.table("hr_onboarding_submissions").select("*").eq("id", submission_id).maybe_single().execute()
    submission = maybe_single_data(resp)
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if submission["status"] != "pending":
        raise HTTPException(status_code=409, detail="Submission already resolved")
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    created_employee_id = None
    if body.action == "approve":
        if not body.employee_code or not body.password:
            raise HTTPException(status_code=400, detail="employee_code and password are required to approve")
        created_employee_id = _create_employee_from_submission(submission, body)

    supabase.table("hr_onboarding_submissions").update({
        "status": "approved" if body.action == "approve" else "rejected",
        "admin_note": body.admin_note,
        "resolved_by": user["id"],
        "resolved_at": datetime.now(timezone.utc).isoformat(),
        "created_employee_id": created_employee_id,
    }).eq("id", submission_id).execute()

    return {"ok": True, "created_employee_id": created_employee_id}
