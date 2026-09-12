import re

from fastapi import APIRouter, Depends, HTTPException

from auth import CONSOLE_ROLES, get_current_user, hash_password, require_accounts, require_permission, user_can
from database import maybe_single_data, supabase
from models import (
    EmployeeCreate, EmployeeUpdate, PasswordReset, ReportingManagerImportRequest, SalaryImportRequest,
    StatutoryFlagsImportRequest,
)

router = APIRouter(prefix="/api/employees", tags=["employees"])

SALARY_FIELDS = ("basic", "hra", "conveyance", "other_allowance", "monthly_bonus", "retention", "incentive")


def _sanitize(employee: dict, can_view_salary: bool) -> dict:
    employee.pop("password_hash", None)
    # salary.edit deliberately does NOT imply salary.view here — HR can be
    # granted the ability to set salary figures (bulk import, new hires)
    # without being able to see anyone's existing pay; only salary.view
    # (accounts always, or a per-person override) shows the actual numbers.
    if not can_view_salary:
        for field in SALARY_FIELDS:
            employee.pop(field, None)
    return employee


LITE_FIELDS = "id,employee_code,first_name,last_name,is_active,department,designation,location,role,employee_category,is_intern"


@router.get("")
def list_employees(lite: bool = False, user: dict = Depends(require_permission("employees.view"))):
    # Most callers of this endpoint just need it for an id->name lookup
    # (a dropdown, a report filter) — lite=true skips salary/compliance/bank
    # columns and the salary.view permission check entirely.
    if lite:
        return supabase.table("hr_employees").select(LITE_FIELDS).order("first_name").execute().data
    resp = supabase.table("hr_employees").select("*").order("first_name").execute()
    # Compute once per request, not once per employee — user_can() re-queries
    # hr_permissions/hr_permission_overrides for any non-"accounts" role, so
    # calling it inside the loop turned a single request into 2x the
    # employee count in extra Supabase round-trips (~450 for 223 employees).
    can_view_salary = user_can(user, "salary.view")
    return [_sanitize(e, can_view_salary) for e in resp.data]


@router.get("/birthdays")
def list_birthdays(user: dict = Depends(require_permission("employees.view"))):
    """Bulk join, not one profile fetch per employee — date_of_birth lives
    on hr_employee_profile, not hr_employees, so this can't just reuse
    list_employees' response. HQ (Madhu Estate, Mumbai) only, by design —
    not the retail/warehouse roster."""
    employees = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,department,location,is_active")
        .eq("location", "Madhu Estate, Mumbai")
        .execute()
        .data
    )
    profiles = supabase.table("hr_employee_profile").select("employee_id,date_of_birth").execute().data
    dob_by_employee = {p["employee_id"]: p["date_of_birth"] for p in profiles if p.get("date_of_birth")}
    return [
        {
            "employee_id": e["id"],
            "employee_code": e["employee_code"],
            "name": f"{e['first_name']} {e.get('last_name', '')}".strip(),
            "department": e.get("department", ""),
            "location": e.get("location", ""),
            "is_active": e["is_active"],
            "date_of_birth": dob_by_employee.get(e["id"]),
        }
        for e in employees
    ]


@router.get("/anniversaries")
def list_anniversaries(user: dict = Depends(require_permission("employees.view"))):
    """Mirrors /birthdays, but date_of_joining lives directly on hr_employees
    (no hr_employee_profile join needed). Same HQ (Madhu Estate, Mumbai)
    scoping as birthdays, by design — not the retail/warehouse roster."""
    employees = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,department,location,is_active,date_of_joining")
        .eq("location", "Madhu Estate, Mumbai")
        .execute()
        .data
    )
    return [
        {
            "employee_id": e["id"],
            "employee_code": e["employee_code"],
            "name": f"{e['first_name']} {e.get('last_name', '')}".strip(),
            "department": e.get("department", ""),
            "location": e.get("location", ""),
            "is_active": e["is_active"],
            "date_of_joining": e.get("date_of_joining"),
        }
        for e in employees
    ]


@router.post("/bulk-salary")
def bulk_import_salary(body: SalaryImportRequest, user: dict = Depends(require_permission("salary.edit"))):
    """Set Basic/HRA/Conveyance/Other/Incentive for many employees at once, matched by employee_code."""
    existing = supabase.table("hr_employees").select("id,employee_code").execute().data
    id_by_code = {e["employee_code"]: e["id"] for e in existing}

    updated, not_found, rows_to_upsert = [], [], []
    for row in body.rows:
        emp_id = id_by_code.get(row.employee_code)
        if not emp_id:
            not_found.append(row.employee_code)
            continue
        rows_to_upsert.append({
            "id": emp_id,
            "basic": row.basic,
            "hra": row.hra,
            "conveyance": row.conveyance,
            "other_allowance": row.other_allowance,
            "incentive": row.incentive,
        })
        updated.append(row.employee_code)

    # One batched upsert (matches on the primary key, always an UPDATE here
    # since every id came from an existing row) instead of one round-trip
    # per imported row.
    if rows_to_upsert:
        supabase.table("hr_employees").upsert(rows_to_upsert).execute()

    return {"updated": len(updated), "not_found": not_found}


_HONORIFIC_TOKENS = {"maam", "ma'am", "madam", "mam", "sir", "ma'amsir"}
_NAME_SPLIT_RE = re.compile(r"[/,&]|\band\b", re.IGNORECASE)


def _clean_name_token(token: str) -> str:
    return re.sub(r"[^a-z' ]", "", token.strip().lower()).strip()


def _split_reporting_to(text: str) -> list[str]:
    """Splits a free-text reporting_to entry into individual name references
    — HR often wrote "Dharmesh/Akshay" or "Unnati/ Dharmesh" meaning EITHER
    could be the real manager, not a typo needing normalizing. Each part is
    resolved separately; an honorific-only part ("Ma'am", "Sir") contributes
    no candidate at all, matching how it carries no actual name."""
    parts = [p.strip() for p in _NAME_SPLIT_RE.split(text) if p.strip()]
    return [p for p in parts if _clean_name_token(p) not in _HONORIFIC_TOKENS]


def _strip_honorific_words(part: str) -> str:
    """A name and an honorific are often written as one token — "Monica
    Ma'am", "Nehal sir" — rather than split by a separator _split_reporting_to
    would catch. Drops just the honorific word(s), leaving the actual name to
    match against, without changing how many parts the entry counted as."""
    words = [w for w in re.split(r"\s+", part.strip()) if w]
    kept = [w for w in words if _clean_name_token(w) not in _HONORIFIC_TOKENS]
    return " ".join(kept) if kept else part


@router.get("/reporting-manager-suggestions")
def reporting_manager_suggestions(user: dict = Depends(require_permission("employees.manage"))):
    """Best-guess resolution of hr_employee_profile.reporting_to (a free-text
    name HR typed by hand, e.g. "Sagar", "Dharmesh/Akshay", "Ma'am/ Sir") to
    an actual employee_code — feeds the reporting-manager import template's
    prefill so HR reviews/corrects ~150 rows instead of typing every one from
    scratch. Never writes anything; bulk_import_reporting_manager below is
    still the one place reporting_to_id actually gets set, so a wrong guess
    here can only produce a wrong prefill HR can edit before importing, never
    a silent wrong write.

    A name is only "matched" when it splits to exactly one name reference AND
    that reference matches exactly one active employee — several first names
    are shared by 2+ people company-wide (checked directly against
    hr_employees), so a same-first-name match is reported as "ambiguous" with
    every candidate listed rather than guessed at. A multi-person entry like
    "Dharmesh/Akshay" is always "ambiguous" even if both halves individually
    resolve cleanly — picking either one over the other isn't this
    endpoint's call to make."""
    employees = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,department,is_active")
        .execute()
        .data
    ) or []
    by_id = {e["id"]: e for e in employees}
    active = [e for e in employees if e.get("is_active")]

    name_index: dict[str, list[dict]] = {}
    for e in active:
        full = f"{e['first_name']} {e.get('last_name') or ''}".strip()
        for key in {_clean_name_token(e["first_name"]), _clean_name_token(full)}:
            if key:
                name_index.setdefault(key, []).append(e)

    def _candidates_for(part: str) -> list[dict]:
        return name_index.get(_clean_name_token(part), [])

    profiles = (
        supabase.table("hr_employee_profile")
        .select("employee_id,reporting_to,reporting_to_id")
        .execute()
        .data
    ) or []

    rows = []
    for p in profiles:
        emp = by_id.get(p["employee_id"])
        if not emp or not emp.get("is_active"):
            continue
        reporting_to = (p.get("reporting_to") or "").strip()
        if p.get("reporting_to_id") or not reporting_to:
            continue  # already resolved, or genuinely nothing on file

        parts = _split_reporting_to(reporting_to)
        candidates_by_code: dict[str, dict] = {}
        for part in parts:
            for c in _candidates_for(_strip_honorific_words(part)):
                candidates_by_code[c["employee_code"]] = c
        candidates = list(candidates_by_code.values())

        if not parts:
            status, suggested = "unresolved", None
        elif len(parts) == 1 and len(candidates) == 1:
            status, suggested = "matched", candidates[0]
        elif not candidates:
            status, suggested = "unresolved", None
        else:
            status, suggested = "ambiguous", None

        rows.append({
            "employee_code": emp["employee_code"],
            "name": f"{emp['first_name']} {emp.get('last_name') or ''}".strip(),
            "department": emp.get("department"),
            "reporting_to": reporting_to,
            "status": status,
            "suggested_manager_code": suggested["employee_code"] if suggested else None,
            "suggested_manager_name": (
                f"{suggested['first_name']} {suggested.get('last_name') or ''}".strip() if suggested else None
            ),
            "candidates": [
                f"{c['employee_code']} — {c['first_name']} {c.get('last_name') or ''} ({c.get('department') or '—'})".strip()
                for c in candidates
            ],
        })
    return rows


@router.post("/bulk-reporting-manager")
def bulk_import_reporting_manager(
    body: ReportingManagerImportRequest, user: dict = Depends(require_permission("employees.manage")),
):
    """Set each employee's reporting manager (hr_employee_profile.reporting_to_id
    + a cached reporting_to_email) at once, matched by employee_code on both
    sides. This is the field routers/payroll.py's late-digest reads to email
    each late employee's actual manager — until it's populated, that digest
    only ever reaches HR (see _reporting_manager_emails), which is why a bulk
    import exists here instead of requiring 223 one-by-one profile edits."""
    existing = supabase.table("hr_employees").select("id,employee_code,first_name,last_name,email").execute().data
    by_code = {e["employee_code"]: e for e in existing}

    updated, not_found, no_manager_email, rows_to_upsert = [], [], [], []
    for row in body.rows:
        emp = by_code.get(row.employee_code)
        mgr = by_code.get(row.manager_employee_code)
        if not emp:
            not_found.append(row.employee_code)
            continue
        if not mgr:
            not_found.append(row.manager_employee_code)
            continue
        if not mgr.get("email"):
            no_manager_email.append(row.manager_employee_code)
            continue
        rows_to_upsert.append({
            "employee_id": emp["id"],
            "reporting_to_id": mgr["id"],
            "reporting_to_email": mgr["email"],
            "reporting_to": f"{mgr['first_name']} {mgr.get('last_name', '')}".strip(),
        })
        updated.append(row.employee_code)

    if rows_to_upsert:
        supabase.table("hr_employee_profile").upsert(rows_to_upsert, on_conflict="employee_id").execute()

    return {"updated": len(updated), "not_found": not_found, "no_manager_email": no_manager_email}


@router.get("/statutory-flags")
def list_statutory_flags(user: dict = Depends(require_permission("salary.edit"))):
    """PF/EPS/ESIC/PT/LWF applicability per active employee — these live on
    hr_employee_profile and, unlike every other compliance field, were never
    populated at scale (only ever set one employee at a time via the profile
    edit screen), which leaves the PF/ESIC/LWF reports in routers/payroll.py
    reading `false` for almost the entire roster. Powers the bulk-edit
    template the same way bulk-reporting-manager's CSV does."""
    employees = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,is_active")
        .eq("is_active", True)
        .order("first_name")
        .execute()
        .data
    )
    profiles = (
        supabase.table("hr_employee_profile")
        .select("employee_id,pf_applicable,eps_applicable,esic_applicable,pt_applicable,lwf_applicable")
        .execute()
        .data
    )
    flags_by_id = {p["employee_id"]: p for p in profiles}
    return [
        {
            "employee_code": e["employee_code"],
            "name": f"{e['first_name']} {e.get('last_name', '')}".strip(),
            "pf_applicable": bool(flags_by_id.get(e["id"], {}).get("pf_applicable")),
            "eps_applicable": bool(flags_by_id.get(e["id"], {}).get("eps_applicable")),
            "esic_applicable": bool(flags_by_id.get(e["id"], {}).get("esic_applicable")),
            "pt_applicable": bool(flags_by_id.get(e["id"], {}).get("pt_applicable")),
            "lwf_applicable": bool(flags_by_id.get(e["id"], {}).get("lwf_applicable")),
        }
        for e in employees
    ]


@router.post("/bulk-statutory-flags")
def bulk_import_statutory_flags(body: StatutoryFlagsImportRequest, user: dict = Depends(require_permission("salary.edit"))):
    """Set PF/EPS/ESIC/PT/LWF applicability for many employees at once,
    matched by employee_code — see list_statutory_flags above for why this
    exists (the PF/ESIC/LWF reports are near-empty without it)."""
    existing = supabase.table("hr_employees").select("id,employee_code").execute().data
    id_by_code = {e["employee_code"]: e["id"] for e in existing}

    updated, not_found, rows_to_upsert = [], [], []
    for row in body.rows:
        emp_id = id_by_code.get(row.employee_code)
        if not emp_id:
            not_found.append(row.employee_code)
            continue
        rows_to_upsert.append({
            "employee_id": emp_id,
            "pf_applicable": row.pf_applicable,
            "eps_applicable": row.eps_applicable,
            "esic_applicable": row.esic_applicable,
            "pt_applicable": row.pt_applicable,
            "lwf_applicable": row.lwf_applicable,
        })
        updated.append(row.employee_code)

    if rows_to_upsert:
        supabase.table("hr_employee_profile").upsert(rows_to_upsert, on_conflict="employee_id").execute()

    return {"updated": len(updated), "not_found": not_found}


def _require_role_grant_allowed(user: dict, role: str | None) -> None:
    """Only Accounts can hand out admin-console access (hr/accounts roles) —
    otherwise HR (with employees.manage) could self-escalate or mint new
    Accounts/HR logins."""
    if role and role != "employee" and user["role"] != "accounts":
        raise HTTPException(status_code=403, detail="Only Accounts can assign HR/Accounts console roles")


@router.get("/{employee_id}")
def get_employee(employee_id: str, user: dict = Depends(get_current_user)):
    if user["id"] != employee_id:
        if user["role"] not in CONSOLE_ROLES or not user_can(user, "employees.view"):
            raise HTTPException(status_code=403, detail="Not authorized")
    resp = supabase.table("hr_employees").select("*").eq("id", employee_id).maybe_single().execute()
    data = maybe_single_data(resp)
    if not data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _sanitize(data, user_can(user, "salary.view"))


@router.post("")
def create_employee(body: EmployeeCreate, user: dict = Depends(require_permission("employees.manage"))):
    _require_role_grant_allowed(user, body.role)
    existing = (
        supabase.table("hr_employees")
        .select("id")
        .eq("employee_code", body.employee_code)
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="Employee code already exists")

    row = body.model_dump(exclude={"password"})
    row["date_of_joining"] = row["date_of_joining"].isoformat() if row["date_of_joining"] else None
    row["leave_approver_id"] = row["leave_approver_id"] or None
    row["password_hash"] = hash_password(body.password)
    if not user_can(user, "salary.edit"):
        for field in SALARY_FIELDS:
            row[field] = 0

    inserted = supabase.table("hr_employees").insert(row).execute()
    return _sanitize(inserted.data[0], user_can(user, "salary.view"))


@router.put("/{employee_id}")
def update_employee(employee_id: str, body: EmployeeUpdate, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    _require_role_grant_allowed(user, body.role)
    updates = body.model_dump(exclude_unset=True, exclude={"password"})
    if "date_of_joining" in updates and updates["date_of_joining"] is not None:
        updates["date_of_joining"] = updates["date_of_joining"].isoformat()
    if "roster_last_seen_at" in updates and updates["roster_last_seen_at"] is not None:
        updates["roster_last_seen_at"] = updates["roster_last_seen_at"].isoformat()
    if "leave_approver_id" in updates:
        updates["leave_approver_id"] = updates["leave_approver_id"] or None
    if body.password:
        updates["password_hash"] = hash_password(body.password)
    if not user_can(user, "salary.edit"):
        for field in SALARY_FIELDS:
            updates.pop(field, None)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    resp = supabase.table("hr_employees").update(updates).eq("id", employee_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _sanitize(resp.data[0], user_can(user, "salary.view"))


@router.put("/{employee_id}/password")
def reset_password(employee_id: str, body: PasswordReset, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    """Deliberately narrower than update_employee: lets a policy.manage-only
    login (e.g. Nimit, Rushikesh) reset anyone's password without also
    unlocking editing of their name/department/designation/active-status."""
    if len(body.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
    resp = (
        supabase.table("hr_employees")
        .update(
            {
                "password_hash": hash_password(body.password),
                "failed_login_count": 0,
                "locked_until": None,
                "password_changed_by_employee": False,
            }
        )
        .eq("id", employee_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"ok": True}


@router.delete("/{employee_id}")
def deactivate_employee(employee_id: str, user: dict = Depends(require_permission("employees.manage"))):
    """Soft delete — payroll/attendance history must stay intact."""
    resp = (
        supabase.table("hr_employees")
        .update({"is_active": False})
        .eq("id", employee_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"ok": True}


@router.put("/{employee_id}/reactivate")
def reactivate_employee(employee_id: str, user: dict = Depends(require_permission("employees.manage"))):
    """Undoes the soft delete above — master data (salary structure, profile,
    payroll/attendance history) was never touched by deactivation, so this is
    just flipping is_active back on."""
    resp = (
        supabase.table("hr_employees")
        .update({"is_active": True})
        .eq("id", employee_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"ok": True}


@router.delete("/{employee_id}/permanent")
def permanently_delete_employee(employee_id: str, user: dict = Depends(require_accounts)):
    """Irreversible — cascades every payroll/attendance/leave/salary-structure
    row via the FK ON DELETE CASCADE constraints, plus biometric punches
    (linked only by employee_code, not a FK, so cleaned up explicitly here).
    Accounts-only, unlike the soft-delete above. Reserved for
    employee_roster_sync.py's removed-from-biometrics cleanup — every other
    removal path in the app is deliberately the soft delete instead."""
    resp = supabase.table("hr_employees").select("employee_code").eq("id", employee_id).maybe_single().execute()
    data = maybe_single_data(resp)
    if not data:
        raise HTTPException(status_code=404, detail="Employee not found")
    supabase.table("hr_biometric_punches").delete().eq("employee_code", data["employee_code"]).execute()
    supabase.table("hr_employees").delete().eq("id", employee_id).execute()
    return {"ok": True}
