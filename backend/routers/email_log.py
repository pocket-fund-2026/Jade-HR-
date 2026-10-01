"""Outbound email audit (sql/069) — every "Tina at JADE HR" send attempt,
with Resend's own delivery status on demand, plus a test-send so HR can
prove end-to-end delivery to a given inbox without waiting for a real
leave request or digest to fire."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

import email_service
from auth import require_permission
from database import maybe_single_data, supabase
from routers.new_joiner_email import recipient_emails

router = APIRouter(prefix="/api/email-log", tags=["email-log"])

PERM = require_permission("email_log.view")


class TestEmailRequest(BaseModel):
    to: str


@router.get("")
def list_log(
    kind: str | None = Query(default=None),
    status: str | None = Query(default=None),
    q: str | None = Query(default=None, description="Recipient or subject contains"),
    limit: int = Query(default=200, ge=1, le=1000),
    user: dict = Depends(PERM),
):
    query = supabase.table("hr_email_log").select("*").order("created_at", desc=True).limit(limit)
    if kind:
        query = query.eq("kind", kind)
    if status:
        query = query.eq("status", status)
    if q:
        term = q.replace(",", " ").strip()
        query = query.or_(f"to_email.ilike.%{term}%,subject.ilike.%{term}%")
    return query.execute().data


@router.get("/health")
def email_health(user: dict = Depends(PERM)):
    """Everything that decides whether a Tina email can reach someone, in
    one place: is the sender configured, who the fixed recipients are, and
    how many people have no address on file to be mailed at all."""
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    recent = (
        supabase.table("hr_email_log").select("status").gte("created_at", since).limit(5000).execute().data or []
    )
    counts = {"sent": 0, "failed": 0, "skipped": 0}
    for r in recent:
        counts[r["status"]] = counts.get(r["status"], 0) + 1

    active = (
        supabase.table("hr_employees").select("id,email,leave_approver_id").eq("is_active", True).execute().data or []
    )
    no_email = sum(1 for e in active if not (e.get("email") or "").strip())
    no_approver = sum(1 for e in active if not e.get("leave_approver_id"))

    return {
        "configured": email_service.is_configured(),
        "from": f"Tina at JADE HR <{email_service.EMAIL_FROM}>",
        "hr_notify_email": email_service.HR_NOTIFY_EMAIL,
        "salary_hold_notify_email": email_service.SALARY_HOLD_NOTIFY_EMAIL,
        "new_joiner_recipients": recipient_emails(),
        "active_employees": len(active),
        "active_without_email": no_email,
        "active_without_leave_approver": no_approver,
        "last_7_days": counts,
    }


@router.post("/test")
def send_test(body: TestEmailRequest, user: dict = Depends(PERM)):
    to = body.to.strip().lower()
    if "@" not in to:
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    sender = f"{user.get('first_name', '')} {user.get('last_name') or ''}".strip() or "HR"
    sent_at = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    ok, err = email_service.send_email_detailed(
        to,
        "JADE HR test email",
        f"This is a test email from the JADE HR console, sent by {sender} at {sent_at}.\n\n"
        "If you can read this, emails from Tina at JADE HR are reaching this inbox. "
        "If it landed in Spam, mark it 'Not spam' so future HR emails arrive in the inbox.\n",
        kind="test",
    )
    if not ok:
        raise HTTPException(status_code=502, detail=f"Send failed: {err}")
    return {"ok": True}


@router.post("/{log_id}/refresh")
def refresh_status(log_id: str, user: dict = Depends(PERM)):
    row = maybe_single_data(supabase.table("hr_email_log").select("*").eq("id", log_id).maybe_single().execute())
    if not row:
        raise HTTPException(status_code=404, detail="Log entry not found")
    if not row.get("provider_id"):
        raise HTTPException(status_code=400, detail="This email was never accepted by Resend, so it has no delivery status")
    last_event, err = email_service.fetch_delivery_status(row["provider_id"])
    if err:
        raise HTTPException(status_code=502, detail=f"Could not reach Resend: {err}")
    updated = supabase.table("hr_email_log").update({"last_event": last_event}).eq("id", log_id).execute()
    return updated.data[0] if updated.data else {**row, "last_event": last_event}
