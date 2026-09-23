"""HR-managed recipient list for the new-joiner credential-setup email (see
email_service.notify_new_joiner) — who gets pinged when a joining date is
set, chosen by HR rather than hardcoded. Being on this list does NOT grant
any HR console access."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from auth import require_permission
from database import supabase

router = APIRouter(prefix="/api/new-joiner-recipients", tags=["new-joiner-email"])


class RecipientCreate(BaseModel):
    email: str
    label: str = ""


@router.get("")
def list_recipients(user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    return supabase.table("hr_new_joiner_email_recipients").select("*").order("created_at").execute().data


@router.post("")
def add_recipient(body: RecipientCreate, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    row = {"email": body.email.lower(), "label": body.label}
    existing = supabase.table("hr_new_joiner_email_recipients").select("id").eq("email", row["email"]).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="Already on the recipient list")
    inserted = supabase.table("hr_new_joiner_email_recipients").insert(row).execute()
    return inserted.data[0]


@router.delete("/{recipient_id}")
def remove_recipient(recipient_id: str, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    resp = supabase.table("hr_new_joiner_email_recipients").delete().eq("id", recipient_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Recipient not found")
    return {"ok": True}


def recipient_emails() -> list[str]:
    rows = supabase.table("hr_new_joiner_email_recipients").select("email").execute().data or []
    return [r["email"] for r in rows]
