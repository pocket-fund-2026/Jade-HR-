from fastapi import APIRouter, Depends, HTTPException

from auth import CONSOLE_ROLES, get_current_user, hash_password, require_accounts, require_permission, user_can
from database import maybe_single_data, supabase
from models import EmployeeCreate, EmployeeUpdate, PasswordReset, SalaryImportRequest

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


@router.get("")
def list_employees(user: dict = Depends(require_permission("employees.view"))):
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


@router.post("/bulk-salary")
def bulk_import_salary(body: SalaryImportRequest, user: dict = Depends(require_permission("salary.edit"))):
    """Set Basic/HRA/Conveyance/Other/Incentive for many employees at once, matched by employee_code."""
    existing = supabase.table("hr_employees").select("id,employee_code").execute().data
    id_by_code = {e["employee_code"]: e["id"] for e in existing}

    updated, not_found = [], []
    for row in body.rows:
        emp_id = id_by_code.get(row.employee_code)
        if not emp_id:
            not_found.append(row.employee_code)
            continue
        supabase.table("hr_employees").update({
            "basic": row.basic,
            "hra": row.hra,
            "conveyance": row.conveyance,
            "other_allowance": row.other_allowance,
            "incentive": row.incentive,
        }).eq("id", emp_id).execute()
        updated.append(row.employee_code)

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
        .update({"password_hash": hash_password(body.password), "failed_login_count": 0, "locked_until": None})
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
