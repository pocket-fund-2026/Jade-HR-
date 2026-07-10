from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import require_accounts, require_console, require_permissions_manage
from database import supabase
from models import BulkOverrideRequest, PermissionUpdate

router = APIRouter(prefix="/api/permissions", tags=["permissions"])


@router.get("")
def list_permissions(user: dict = Depends(require_console)):
    """Readable by accounts or hr — hr's own frontend needs this to know what
    nav items/fields to show; accounts needs it to edit."""
    resp = supabase.table("hr_permissions").select("*").order("permission_key").execute()
    return resp.data


@router.put("/{permission_key}")
def update_permission(permission_key: str, body: PermissionUpdate, user: dict = Depends(require_accounts)):
    resp = (
        supabase.table("hr_permissions")
        .update({
            "hr_can_access": body.hr_can_access,
            "updated_by": user["id"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("permission_key", permission_key)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Unknown permission key")
    return resp.data[0]


@router.get("/overrides")
def list_all_overrides(user: dict = Depends(require_permissions_manage)):
    """Every per-person override currently set, for the management UI."""
    resp = (
        supabase.table("hr_permission_overrides")
        .select("*, hr_employees!hr_permission_overrides_employee_id_fkey(first_name,last_name,employee_code)")
        .order("updated_at", desc=True)
        .execute()
    )
    return resp.data


@router.put("/overrides/{employee_id}/{permission_key}")
def set_override(employee_id: str, permission_key: str, body: PermissionUpdate, user: dict = Depends(require_permissions_manage)):
    row = {
        "employee_id": employee_id,
        "permission_key": permission_key,
        "granted": body.hr_can_access,
        "updated_by": user["id"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = supabase.table("hr_permission_overrides").upsert(row, on_conflict="employee_id,permission_key").execute()
    return resp.data[0]


@router.delete("/overrides/{employee_id}/{permission_key}")
def clear_override(employee_id: str, permission_key: str, user: dict = Depends(require_permissions_manage)):
    supabase.table("hr_permission_overrides").delete().eq("employee_id", employee_id).eq("permission_key", permission_key).execute()
    return {"ok": True}


@router.post("/overrides/bulk")
def bulk_set_overrides(body: BulkOverrideRequest, user: dict = Depends(require_permissions_manage)):
    """Grant or deny one permission for many employees at once — e.g. hide
    the salary column for a whole list of hr logins in one action."""
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {
            "employee_id": eid,
            "permission_key": body.permission_key,
            "granted": body.granted,
            "updated_by": user["id"],
            "updated_at": now,
        }
        for eid in body.employee_ids
    ]
    if not rows:
        return {"updated": 0}
    supabase.table("hr_permission_overrides").upsert(rows, on_conflict="employee_id,permission_key").execute()
    return {"updated": len(rows)}
