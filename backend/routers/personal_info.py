"""Mandatory "Personal Information" login gate, required from every employee,
shown right after the policy acknowledgement gate. Covers: core personal
details, government IDs, bank details, medical (blood group, insurance) and
2 emergency contacts.

Deliberately NOT enforced at the API layer, same as routers/policy_ack.py:
this is a console/UI gate only, so the sync accounts driving
biometric_sync.py, late_digest_notify.py and quarter_red_card_notify.py never
start 403ing just because a real employee hasn't filled this in yet. Also
deliberately its own endpoint rather than reusing
routers/employee_profile.py's PUT /employees/{id}/profile — that one requires
`employees.manage` even to edit your own row, which an ordinary employee
never has. This endpoint only ever writes the signed-in user's own row, and
only the field set below (nothing role/salary/reporting-line related).
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from auth import get_current_user
from database import maybe_single_data, supabase
from models import PersonalInfoUpdate

router = APIRouter(prefix="/api/me", tags=["personal-info"])

# Required unconditionally.
ALWAYS_REQUIRED_FIELDS = (
    "gender",
    "date_of_birth",
    "marital_status",
    "father_name",
    "personal_email_id",
    "current_address",
    "aadhar_no",
    "pan_no",
    "bank_name",
    "bank_account_no",
    "bank_ifsc",
    "blood_group",
    "insurance",
    "additional_contact_1_name",
    "additional_contact_1_phone",
    "additional_contact_2_name",
    "additional_contact_2_phone",
)

# Exactly one of these two is required, depending on marital_status — a
# single person has no spouse to name, a married person's mother's name
# isn't the field that matters here.
CONDITIONAL_FIELDS = ("mother_name", "spouse_name")

ALL_FIELDS = ALWAYS_REQUIRED_FIELDS + CONDITIONAL_FIELDS

DATE_FIELDS = ("date_of_birth",)


def _required_conditional_field(profile: dict) -> str:
    return "spouse_name" if (profile.get("marital_status") or "").strip() == "Married" else "mother_name"


def _is_complete(profile: dict) -> bool:
    if not all((profile.get(f) or "").strip() for f in ALWAYS_REQUIRED_FIELDS):
        return False
    return bool((profile.get(_required_conditional_field(profile)) or "").strip())


@router.get("/personal-info")
def my_personal_info(user: dict = Depends(get_current_user)):
    """Drives the login gate, so stays cheap — one indexed lookup."""
    resp = (
        supabase.table("hr_employee_profile")
        .select(",".join(ALL_FIELDS))
        .eq("employee_id", user["id"])
        .maybe_single()
        .execute()
    )
    profile = maybe_single_data(resp) or {}
    return {
        "always_required_fields": ALWAYS_REQUIRED_FIELDS,
        "required_conditional_field": _required_conditional_field(profile),
        "complete": _is_complete(profile),
        **{f: profile.get(f) or "" for f in ALL_FIELDS},
    }


@router.put("/personal-info")
def update_my_personal_info(body: PersonalInfoUpdate, user: dict = Depends(get_current_user)):
    updates = body.model_dump(exclude_unset=True)
    for date_field in DATE_FIELDS:
        if date_field in updates and updates[date_field] is not None:
            updates[date_field] = updates[date_field].isoformat()
    updates["employee_id"] = user["id"]
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    supabase.table("hr_employee_profile").upsert(updates, on_conflict="employee_id").execute()
    return my_personal_info(user)
