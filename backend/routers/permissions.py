from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import require_accounts, require_console
from database import supabase
from models import PermissionUpdate

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
