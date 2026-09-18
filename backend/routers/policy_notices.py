"""Editable policy notices/amendments — a short rich-text block per policy
tab (see sql/062_policy_notices.sql for why this exists instead of making
the whole PolicyDocument.jsx tab freeform)."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import get_current_user, require_permission
from database import supabase

router = APIRouter(prefix="/api/policy", tags=["policy-notices"])


class PolicyNoticeUpdate(BaseModel):
    title: str = ""
    body_html: str = ""


@router.get("/notices")
def list_notices(user: dict = Depends(get_current_user)):
    resp = supabase.table("hr_policy_notices").select("*").execute()
    return resp.data


@router.put("/notices/{key}")
def update_notice(
    key: str,
    body: PolicyNoticeUpdate,
    user: dict = Depends(require_permission("employees.manage", "policy.manage")),
):
    row = {
        "title": body.title,
        "body_html": body.body_html,
        "updated_by": user["id"],
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    updated = (
        supabase.table("hr_policy_notices")
        .update(row)
        .eq("key", key)
        .execute()
    )
    if updated.data:
        return updated.data[0]
    inserted = supabase.table("hr_policy_notices").insert({"key": key, **row}).execute()
    return inserted.data[0]
