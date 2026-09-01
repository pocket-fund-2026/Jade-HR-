"""Policy read & acknowledge — the sign-off screen shown on login, plus the
register HR/Accounts use to see who has signed off.

Deliberately NOT enforced at the API layer: the gate is a console/UI one, so
the sync accounts that drive biometric_sync.py, late_digest_notify.py and
quarter_red_card_notify.py keep working headlessly instead of every automated
call starting to 403 the moment a policy version is bumped.
"""

from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request

from auth import get_current_user, require_permission
from database import supabase
from models import PolicyAcknowledgementCreate

router = APIRouter(prefix="/api/policy", tags=["policy-acknowledgement"])

# Bump this whenever the policy text changes materially. Every acknowledgement
# is stored against the version it was given for, so raising it re-prompts the
# whole company on their next login without destroying the older sign-offs.
# Current value covers the Attendance, Punctuality, Leave & WFH Policy v2.0,
# in force from the pay cycle beginning 23 Aug 2026 (LATE_POLICY_V3_EFFECTIVE)
# — supersedes the earlier 22-Sept-2026 late-arrival revision before it ever
# took effect.
POLICY_VERSION = "2026-08-23"

# The documents the console requires people to read, keyed to the tabs in
# frontend/src/pages/PolicyDocument.jsx. Order is the order they're shown in.
# The former standalone "Attendance & WFH Policy (from 23 Aug 2026)" entry
# was merged into "2025 (Retail, Corporate & Factory)" — older acknowledgement
# rows may still have "late-v3-2026-08" in their documents_read, which is
# harmless (it's just historical data, no longer filtered against `known`).
POLICY_DOCUMENTS = [
    {"key": "2026", "label": "2026 Revision (Retail)"},
    {"key": "2025", "label": "2025 (Retail, Corporate & Factory)"},
]


def _ack_row(employee_id: str, policy_version: str = POLICY_VERSION) -> dict | None:
    resp = (
        supabase.table("hr_policy_acknowledgements")
        .select("*")
        .eq("employee_id", employee_id)
        .eq("policy_version", policy_version)
        .execute()
    )
    return resp.data[0] if resp.data else None


@router.get("/acknowledgement/me")
def my_acknowledgement(user: dict = Depends(get_current_user)):
    """Has the signed-in user accepted the CURRENT policy version? Drives the
    login gate, so it must stay cheap — one indexed lookup."""
    row = _ack_row(user["id"])
    return {
        "policy_version": POLICY_VERSION,
        "documents": POLICY_DOCUMENTS,
        "acknowledged": row is not None,
        "acknowledged_at": row["acknowledged_at"] if row else None,
        "documents_read": row["documents_read"] if row else [],
    }


@router.post("/acknowledgement")
def acknowledge(
    body: PolicyAcknowledgementCreate,
    request: Request,
    user: dict = Depends(get_current_user),
):
    """Record the signed-in user's sign-off for the current policy version.
    Idempotent: re-posting returns the original acknowledgement rather than
    moving its timestamp, so the record keeps the moment they FIRST accepted."""
    existing = _ack_row(user["id"])
    if existing:
        return {"already_acknowledged": True, **existing}

    known = {d["key"] for d in POLICY_DOCUMENTS}
    row = {
        "employee_id": user["id"],
        "policy_version": POLICY_VERSION,
        "documents_read": [k for k in body.documents_read if k in known],
        # Kept for the audit trail — an acknowledgement is a record of consent,
        # so where and on what it was given is worth as much as the timestamp.
        "ip_address": request.headers.get("x-forwarded-for", "").split(",")[0].strip()
                      or (request.client.host if request.client else None),
        "user_agent": request.headers.get("user-agent"),
    }
    inserted = supabase.table("hr_policy_acknowledgements").insert(row).execute()
    return {"already_acknowledged": False, **(inserted.data[0] if inserted.data else row)}


@router.get("/acknowledgements")
def acknowledgement_register(
    policy_version: str = Query(default=POLICY_VERSION),
    status: str = Query(default="all", description="all | acknowledged | pending"),
    include_inactive: bool = Query(default=False),
    user: dict = Depends(require_permission("policy.acknowledgements.view")),
):
    """Who has and hasn't signed off, for Accounts and the genuine HR team
    only — deliberately narrower than 'employees.view', which any hr-role
    account (including a team lead who only needs the directory) gets by
    default. There's no schema-level "team lead" vs "HR team" distinction in
    this system (both are just 'hr'-role accounts), so this uses a dedicated
    permission key that defaults OFF for 'hr' (sql/042) — Accounts grants it
    per-person, via the same override mechanism used for every other
    permission, only to accounts that are actually HR team members. Every
    employee on the roster is listed — the point of the register is the
    people MISSING an acknowledgement, so it can't be driven off the
    acknowledgements table alone."""
    employees = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,department,designation,location,role,is_active,employee_category")
        .order("first_name")
        .execute()
        .data
    )
    if not include_inactive:
        employees = [e for e in employees if e.get("is_active")]

    acks = (
        supabase.table("hr_policy_acknowledgements")
        .select("*")
        .eq("policy_version", policy_version)
        .execute()
        .data
    )
    by_employee = {a["employee_id"]: a for a in acks}

    rows = []
    for e in employees:
        ack = by_employee.get(e["id"])
        rows.append({
            "employee_id": e["id"],
            "employee_code": e["employee_code"],
            "name": f"{e['first_name']} {e.get('last_name') or ''}".strip(),
            "department": e.get("department"),
            "designation": e.get("designation"),
            "location": e.get("location"),
            "role": e.get("role"),
            "employee_category": e.get("employee_category"),
            "is_active": e.get("is_active"),
            "acknowledged": ack is not None,
            "acknowledged_at": ack["acknowledged_at"] if ack else None,
            "documents_read": ack["documents_read"] if ack else [],
        })

    if status == "acknowledged":
        rows = [r for r in rows if r["acknowledged"]]
    elif status == "pending":
        rows = [r for r in rows if not r["acknowledged"]]

    acknowledged = sum(1 for r in rows if r["acknowledged"])
    return {
        "policy_version": policy_version,
        "current_policy_version": POLICY_VERSION,
        "documents": POLICY_DOCUMENTS,
        "total": len(rows),
        "acknowledged": acknowledged,
        "pending": len(rows) - acknowledged,
        "generated_at": datetime.now().isoformat(),
        "employees": rows,
    }
