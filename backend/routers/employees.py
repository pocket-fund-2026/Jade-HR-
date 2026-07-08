from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, hash_password, require_admin
from database import supabase
from models import EmployeeCreate, EmployeeUpdate

router = APIRouter(prefix="/api/employees", tags=["employees"])


def _sanitize(employee: dict) -> dict:
    employee.pop("password_hash", None)
    return employee


@router.get("")
def list_employees(admin: dict = Depends(require_admin)):
    resp = supabase.table("hr_employees").select("*").order("first_name").execute()
    return [_sanitize(e) for e in resp.data]


@router.get("/{employee_id}")
def get_employee(employee_id: str, user: dict = Depends(get_current_user)):
    if user["role"] != "admin" and user["id"] != employee_id:
        raise HTTPException(status_code=403, detail="Not authorized")
    resp = supabase.table("hr_employees").select("*").eq("id", employee_id).maybe_single().execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _sanitize(resp.data)


@router.post("")
def create_employee(body: EmployeeCreate, admin: dict = Depends(require_admin)):
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
    row["password_hash"] = hash_password(body.password)

    inserted = supabase.table("hr_employees").insert(row).execute()
    return _sanitize(inserted.data[0])


@router.put("/{employee_id}")
def update_employee(employee_id: str, body: EmployeeUpdate, admin: dict = Depends(require_admin)):
    updates = body.model_dump(exclude_unset=True, exclude={"password"})
    if "date_of_joining" in updates and updates["date_of_joining"] is not None:
        updates["date_of_joining"] = updates["date_of_joining"].isoformat()
    if body.password:
        updates["password_hash"] = hash_password(body.password)

    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    resp = supabase.table("hr_employees").update(updates).eq("id", employee_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return _sanitize(resp.data[0])


@router.delete("/{employee_id}")
def deactivate_employee(employee_id: str, admin: dict = Depends(require_admin)):
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
