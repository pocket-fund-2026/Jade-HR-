"""Policy read & acknowledge — the sign-off screen shown on login, plus the
register HR/Accounts use to see who has signed off.

Deliberately NOT enforced at the API layer: the gate is a console/UI one, so
the sync accounts that drive biometric_sync.py, late_digest_notify.py and
quarter_red_card_notify.py keep working headlessly instead of every automated
call starting to 403 the moment a policy version is bumped.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from auth import get_current_user, require_permission
from database import supabase
from models import PolicyAcknowledgementCreate, PolicyQuizSubmit

router = APIRouter(prefix="/api/policy", tags=["policy-acknowledgement"])

# A passed quiz attempt is required (on top of the read-and-acknowledge row
# below) before the console gate opens — see my_acknowledgement. Score/total
# are self-reported by the client (the question bank ships in the frontend
# bundle, so there's no real answer key to protect server-side), but
# pass/fail is still decided here rather than trusted from the client, so a
# stale or tampered "passed" flag can never slip through.
QUIZ_PASS_RATIO = 0.5

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


def _latest_quiz_attempt(employee_id: str, policy_version: str = POLICY_VERSION) -> dict | None:
    resp = (
        supabase.table("hr_policy_quiz_attempts")
        .select("*")
        .eq("employee_id", employee_id)
        .eq("policy_version", policy_version)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


@router.get("/acknowledgement/me")
def my_acknowledgement(user: dict = Depends(get_current_user)):
    """Has the signed-in user accepted the CURRENT policy version AND passed
    its comprehension quiz? Drives the login gate, so it must stay cheap —
    two indexed lookups. `acknowledged` only flips true once both are done,
    so a page refresh between finishing the read-and-acknowledge step and
    passing the quiz can't slip through the gate."""
    row = _ack_row(user["id"])
    quiz = _latest_quiz_attempt(user["id"])
    quiz_passed = bool(quiz and quiz["passed"])
    return {
        "policy_version": POLICY_VERSION,
        "documents": POLICY_DOCUMENTS,
        "acknowledged": row is not None and quiz_passed,
        "acknowledged_at": row["acknowledged_at"] if row else None,
        "documents_read": row["documents_read"] if row else [],
        "documents_read_recorded": row is not None,
        "quiz_passed": quiz_passed,
        "quiz_last_score": quiz["score"] if quiz else None,
        "quiz_last_total": quiz["total"] if quiz else None,
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


@router.post("/quiz/submit")
def submit_quiz(body: PolicyQuizSubmit, user: dict = Depends(get_current_user)):
    """Records one comprehension-quiz attempt. Every attempt is kept (not
    just the passing one) — a run of failures before a pass is itself a
    useful signal for HR about which sections aren't landing."""
    if body.total <= 0 or body.score < 0 or body.score > body.total:
        raise HTTPException(status_code=400, detail="Invalid score")
    passed = (body.score / body.total) >= QUIZ_PASS_RATIO
    row = {
        "employee_id": user["id"],
        "policy_version": body.policy_version,
        "score": body.score,
        "total": body.total,
        "passed": passed,
        "answers": [a.model_dump() for a in body.answers],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    inserted = supabase.table("hr_policy_quiz_attempts").insert(row).execute()
    return {"passed": passed, **(inserted.data[0] if inserted.data else row)}


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

    # Best (highest-scoring) attempt per employee at this version, not just
    # the latest — a comprehension gap that got fixed on retry two minutes
    # later shouldn't still read as "failed" to whoever's viewing this list.
    quiz_attempts = (
        supabase.table("hr_policy_quiz_attempts")
        .select("employee_id,score,total,passed,created_at")
        .eq("policy_version", policy_version)
        .execute()
        .data
    )
    best_quiz_by_employee: dict[str, dict] = {}
    for a in quiz_attempts:
        current = best_quiz_by_employee.get(a["employee_id"])
        if not current or (a["passed"], a["score"]) > (current["passed"], current["score"]):
            best_quiz_by_employee[a["employee_id"]] = a

    rows = []
    for e in employees:
        ack = by_employee.get(e["id"])
        quiz = best_quiz_by_employee.get(e["id"])
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
            "acknowledged": ack is not None and bool(quiz and quiz["passed"]),
            "acknowledged_at": ack["acknowledged_at"] if ack else None,
            "documents_read": ack["documents_read"] if ack else [],
            "quiz_passed": bool(quiz and quiz["passed"]),
            "quiz_score": quiz["score"] if quiz else None,
            "quiz_total": quiz["total"] if quiz else None,
            "quiz_attempts": sum(1 for a in quiz_attempts if a["employee_id"] == e["id"]),
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
