"""Mandatory "Personal Information" login gate — medical (blood group,
insurance) + 2 emergency contacts, required from every employee, shown right
after the policy acknowledgement gate.

Deliberately NOT enforced at the API layer, same as routers/policy_ack.py:
this is a console/UI gate only, so the sync accounts driving
biometric_sync.py, late_digest_notify.py and quarter_red_card_notify.py never
start 403ing just because a real employee hasn't filled this in yet. Also
deliberately its own endpoint rather than reusing
routers/employee_profile.py's PUT /employees/{id}/profile — that one requires
`employees.manage` even to edit your own row, which an ordinary employee
never has. This endpoint only ever writes the signed-in user's own row, and
only the small field set below.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from auth import get_current_user
from database import maybe_single_data, supabase
from models import PersonalInfoUpdate

router = APIRouter(prefix="/api/me", tags=["personal-info"])

REQUIRED_FIELDS = (
    "blood_group",
    "insurance",
    "additional_contact_1_name",
    "additional_contact_1_phone",
    "additional_contact_2_name",
    "additional_contact_2_phone",
)


def _is_complete(profile: dict) -> bool:
    return all((profile.get(f) or "").strip() for f in REQUIRED_FIELDS)


@router.get("/personal-info")
def my_personal_info(user: dict = Depends(get_current_user)):
    """Drives the login gate, so stays cheap — one indexed lookup."""
    resp = (
        supabase.table("hr_employee_profile")
        .select(",".join(REQUIRED_FIELDS))
        .eq("employee_id", user["id"])
        .maybe_single()
        .execute()
    )
    profile = maybe_single_data(resp) or {}
    return {
        "required_fields": REQUIRED_FIELDS,
        "complete": _is_complete(profile),
        **{f: profile.get(f) or "" for f in REQUIRED_FIELDS},
    }


@router.put("/personal-info")
def update_my_personal_info(body: PersonalInfoUpdate, user: dict = Depends(get_current_user)):
    updates = body.model_dump(exclude_unset=True)
    updates["employee_id"] = user["id"]
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    supabase.table("hr_employee_profile").upsert(updates, on_conflict="employee_id").execute()
    return my_personal_info(user)
