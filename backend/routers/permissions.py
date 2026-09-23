from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import (
    get_hr_permissions,
    get_overrides_scope,
    get_permission_overrides,
    invalidate_permission_cache,
    require_accounts,
    require_console,
    require_overrides_access,
)
from database import supabase
from models import BulkOverrideRequest, PermissionUpdate

router = APIRouter(prefix="/api/permissions", tags=["permissions"])


@router.get("")
def list_permissions(user: dict = Depends(require_console)):
    """Readable by accounts or hr — hr's own frontend needs this to know what
    nav items/fields to show; accounts needs it to edit."""
    resp = supabase.table("hr_permissions").select("*").order("permission_key").execute()
    return resp.data


@router.get("/me")
def my_effective_permissions(user: dict = Depends(require_console)):
    """permission_key -> whether THIS user actually has it right now (role
    default, with their own per-person overrides layered on top). This is
    what nav/route gating should read — GET /api/permissions above is the
    role-wide defaults only, which misses per-person grants entirely."""
    role_defaults = get_hr_permissions()
    if user["role"] == "accounts":
        return {k: True for k in role_defaults}
    overrides = get_permission_overrides(user["id"])
    return {k: overrides.get(k, v) for k, v in role_defaults.items()}


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
    invalidate_permission_cache()
    return resp.data[0]


def _check_scope(user: dict, permission_key: str) -> None:
    """Raises unless this user's override-management scope covers permission_key
    — accounts and full-permissions.manage hr pass everything; an hr login
    scoped to e.g. just roles.manage gets 403 trying to touch any other key."""
    scope = get_overrides_scope(user)
    if scope is not None and permission_key not in scope:
        raise HTTPException(status_code=403, detail="Not permitted — ask Accounts for access")


@router.get("/overrides")
def list_all_overrides(user: dict = Depends(require_overrides_access)):
    """Every per-person override currently set, for the management UI —
    narrowed to just this user's scope for an hr login that isn't a full
    permissions.manage admin (e.g. only sees roles.manage overrides)."""
    scope = get_overrides_scope(user)
    query = supabase.table("hr_permission_overrides").select(
        "*, hr_employees!hr_permission_overrides_employee_id_fkey(first_name,last_name,employee_code)"
    )
    if scope is not None:
        query = query.in_("permission_key", list(scope))
    resp = query.order("updated_at", desc=True).execute()
    return resp.data


@router.put("/overrides/{employee_id}/{permission_key}")
def set_override(employee_id: str, permission_key: str, body: PermissionUpdate, user: dict = Depends(require_overrides_access)):
    _check_scope(user, permission_key)
    row = {
        "employee_id": employee_id,
        "permission_key": permission_key,
        "granted": body.hr_can_access,
        "updated_by": user["id"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = supabase.table("hr_permission_overrides").upsert(row, on_conflict="employee_id,permission_key").execute()
    invalidate_permission_cache(employee_id)
    return resp.data[0]


@router.delete("/overrides/{employee_id}/{permission_key}")
def clear_override(employee_id: str, permission_key: str, user: dict = Depends(require_overrides_access)):
    _check_scope(user, permission_key)
    supabase.table("hr_permission_overrides").delete().eq("employee_id", employee_id).eq("permission_key", permission_key).execute()
    invalidate_permission_cache(employee_id)
    return {"ok": True}


@router.post("/overrides/bulk")
def bulk_set_overrides(body: BulkOverrideRequest, user: dict = Depends(require_overrides_access)):
    """Grant or deny one permission for many employees at once — e.g. hide
    the salary column for a whole list of hr logins in one action."""
    _check_scope(user, body.permission_key)
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
    for eid in body.employee_ids:
        invalidate_permission_cache(eid)
    return {"updated": len(rows)}
