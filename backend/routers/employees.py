from fastapi import APIRouter, Depends, HTTPException

from auth import CONSOLE_ROLES, get_current_user, hash_password, require_permission, user_can
from database import maybe_single_data, supabase
from models import EmployeeCreate, EmployeeUpdate, SalaryImportRequest

router = APIRouter(prefix="/api/employees", tags=["employees"])

SALARY_FIELDS = ("basic", "hra", "conveyance", "other_allowance")


def _sanitize(employee: dict, user: dict) -> dict:
    employee.pop("password_hash", None)
    if not user_can(user, "salary.view", "salary.edit"):
        for field in SALARY_FIELDS:
            employee.pop(field, None)
    return employee


@router.get("")
def list_employees(user: dict = Depends(require_permission("employees.view"))):
    resp = supabase.table("hr_employees").select("*").order("first_name").execute()
    return [_sanitize(e, user) for e in resp.data]


@router.post("/bulk-salary")
def bulk_import_salary(body: SalaryImportRequest, user: dict = Depends(require_permission("salary.edit"))):
    """Set Basic/HRA/Conveyance/Other for many employees at once, matched by employee_code."""
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
    return _sanitize(data, user)


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
    return _sanitize(inserted.data[0], user)


@router.put("/{employee_id}")
def update_employee(employee_id: str, body: EmployeeUpdate, user: dict = Depends(require_permission("employees.manage"))):
    _require_role_grant_allowed(user, body.role)
    updates = body.model_dump(exclude_unset=True, exclude={"password"})
    if "date_of_joining" in updates and updates["date_of_joining"] is not None:
        updates["date_of_joining"] = updates["date_of_joining"].isoformat()
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
    return _sanitize(resp.data[0], user)


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
