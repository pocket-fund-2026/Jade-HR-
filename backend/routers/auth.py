from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import create_access_token, get_current_user, hash_password, verify_password
from database import supabase
from models import BootstrapAdminRequest, LoginRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15


@router.post("/login")
def login(body: LoginRequest):
    resp = (
        supabase.table("hr_employees")
        .select("*")
        .eq("employee_code", body.employee_code)
        .maybe_single()
        .execute()
    )
    employee = resp.data
    if not employee or not employee["is_active"]:
        raise HTTPException(status_code=401, detail="Invalid employee code or password")

    locked_until = employee.get("locked_until")
    if locked_until:
        locked_until_dt = datetime.fromisoformat(locked_until)
        remaining = (locked_until_dt - datetime.now(timezone.utc)).total_seconds()
        if remaining > 0:
            raise HTTPException(
                status_code=423,
                detail=f"Too many failed attempts. Try again in {max(1, int(remaining // 60) + 1)} minute(s).",
            )

    if not verify_password(body.password, employee["password_hash"]):
        new_count = employee.get("failed_login_count", 0) + 1
        updates = {"failed_login_count": new_count}
        if new_count >= MAX_FAILED_ATTEMPTS:
            updates["failed_login_count"] = 0
            updates["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
        supabase.table("hr_employees").update(updates).eq("id", employee["id"]).execute()
        raise HTTPException(status_code=401, detail="Invalid employee code or password")

    if employee.get("failed_login_count", 0) > 0 or employee.get("locked_until"):
        supabase.table("hr_employees").update(
            {"failed_login_count": 0, "locked_until": None}
        ).eq("id", employee["id"]).execute()

    token = create_access_token(employee)
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": employee["role"],
        "name": f"{employee['first_name']} {employee.get('last_name', '')}".strip(),
    }


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    user.pop("password_hash", None)
    user.pop("_claims", None)
    return user


@router.post("/bootstrap-admin")
def bootstrap_admin(body: BootstrapAdminRequest):
    """Creates the first admin account. Only works while hr_employees is empty."""
    existing = supabase.table("hr_employees").select("id").limit(1).execute()
    if existing.data:
        raise HTTPException(status_code=403, detail="Setup already completed — an account already exists")

    row = {
        "employee_code": body.employee_code,
        "first_name": body.first_name,
        "last_name": body.last_name,
        "role": "admin",
        "password_hash": hash_password(body.password),
        "basic": 0,
        "hra": 0,
        "conveyance": 0,
    }
    inserted = supabase.table("hr_employees").insert(row).execute()
    employee = inserted.data[0]
    token = create_access_token(employee)
    return {"access_token": token, "token_type": "bearer", "role": "admin"}
