"""Offer letter approval + e-sign flow.

HR issues an offer letter, then sends it for approval: the approver (Head-HR)
gets an emailed link, types their initials and approves; the candidate then
gets their own link to sign and accept; the signed copy goes to the
candidate, team HR, accounts and any extra emails / employee codes HR listed
(employee codes also see a notice on their dashboard). The two public links
are unguessable tokens, same pattern as the careers assignment links."""

import html as html_lib
import os
import re
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import email_service
import onboarding_pipeline
from auth import get_current_user, require_permission
from database import maybe_single_data, supabase
from letter_email import HR_CONTACT, build_letter_email_html

router = APIRouter(prefix="/api/offers", tags=["offers"])

APP_URL = "https://jade-hr.vercel.app"
DEFAULT_APPROVER = os.environ.get("OFFER_APPROVER_EMAIL", email_service.HR_NOTIFY_EMAIL)
ACCOUNTS_EMAIL = os.environ.get("OFFER_ACCOUNTS_EMAIL", "")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class SendForApproval(BaseModel):
    approver_email: str = ""
    candidate_email: str
    # Extra emails and/or employee codes that get the signed copy; codes
    # also see it on their dashboard.
    notify: list[str] = []
    include_accounts: bool = True


class SignBody(BaseModel):
    initials: str = ""
    signature: str = ""
    confirm: bool = False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stamp(label: str, who: str, extra: str) -> str:
    return (
        '<div class="lt-accept" style="margin-top:1.2em"><span class="lt-label">' + html_lib.escape(label) + "</span>"
        f'<p style="font-family:Georgia,serif;font-size:20px;font-style:italic;margin:4px 0">{html_lib.escape(who)}</p>'
        f'<p style="font-size:11.5px;color:#666;margin:0">{html_lib.escape(extra)}</p></div>'
    )


def _letter_by_token(token: str) -> tuple[dict, str]:
    for col, role in (("approver_token", "approver"), ("candidate_token", "candidate")):
        row = maybe_single_data(supabase.table("hr_generated_letters").select("*").eq(col, token).maybe_single().execute())
        if row:
            return row, role
    raise HTTPException(status_code=404, detail="This link is not valid. Ask HR to send a fresh one.")


def _candidate_name(row: dict) -> str:
    return (row.get("field_values") or {}).get("employee_name", "") or "the candidate"


def _split_notify(items: list[str]) -> tuple[list[str], list[str]]:
    emails, codes = [], []
    for raw in items:
        v = raw.strip()
        if not v:
            continue
        (emails if "@" in v else codes).append(v.lower() if "@" in v else v)
    return list(dict.fromkeys(emails)), list(dict.fromkeys(codes))


@router.post("/{letter_id}/send-for-approval")
def send_for_approval(letter_id: str, body: SendForApproval, user: dict = Depends(require_permission("letters.generate"))):
    row = maybe_single_data(supabase.table("hr_generated_letters").select("*").eq("id", letter_id).maybe_single().execute())
    if not row:
        raise HTTPException(status_code=404, detail="Letter not found")
    if not row["letter_type"].startswith("offer"):
        raise HTTPException(status_code=400, detail="Only offer letters go through approval")
    if row.get("approval_status") in ("awaiting_candidate", "accepted"):
        raise HTTPException(status_code=409, detail="This offer is already approved. It cannot be restarted.")
    approver = (body.approver_email or DEFAULT_APPROVER).strip().lower()
    candidate = body.candidate_email.strip().lower()
    if not EMAIL_RE.match(approver) or not EMAIL_RE.match(candidate):
        raise HTTPException(status_code=400, detail="Enter valid approver and candidate email addresses")
    emails, codes = _split_notify(body.notify)
    for e in emails:
        if not EMAIL_RE.match(e):
            raise HTTPException(status_code=400, detail=f"'{e}' is not a valid email address")
    if codes:
        found = {r["employee_code"] for r in supabase.table("hr_employees").select("employee_code").in_("employee_code", codes).execute().data or []}
        missing = [c for c in codes if c not in found]
        if missing:
            raise HTTPException(status_code=400, detail=f"No employee with ID {', '.join(missing)}")
    recipients = emails + codes
    if body.include_accounts and ACCOUNTS_EMAIL and ACCOUNTS_EMAIL.lower() not in recipients:
        recipients.append(ACCOUNTS_EMAIL.lower())

    token = secrets.token_urlsafe(24)
    supabase.table("hr_generated_letters").update({
        "approval_status": "awaiting_approval", "approver_email": approver, "approver_token": token,
        "candidate_email": candidate, "notify_recipients": recipients, "approver_initials": None, "approved_at": None,
    }).eq("id", letter_id).execute()

    name, title = _candidate_name(row), row.get("title") or "Offer letter"
    link = f"{APP_URL}/sign/{token}"
    text = (
        f"The {title} for {name} is ready for your approval.\n\n"
        f"Review it, add your initials and approve: {link}\n\n"
        "Once you approve, it goes to the candidate to sign and accept."
    )
    ok, err = email_service.send_email_detailed(
        approver, f"Approval needed: {title} for {name}", text, kind="offer_approval", reply_to=HR_CONTACT, letter_id=letter_id,
    )
    if not ok:
        raise HTTPException(status_code=502, detail=f"Approval email could not be sent: {err}")
    return {"ok": True, "approval_status": "awaiting_approval", "approver_email": approver}


@router.get("/sign/{token}")
def view_for_signing(token: str):
    row, role = _letter_by_token(token)
    if row["letter_type"] == onboarding_pipeline.NDA_TYPE:
        return onboarding_pipeline.nda_view(row, role)
    status = row.get("approval_status")
    can_act = (role == "approver" and status == "awaiting_approval") or (role == "candidate" and status == "awaiting_candidate")
    return {
        "kind": "offer", "role": role, "status": status, "can_act": can_act, "title": row.get("title") or "Offer letter",
        "candidate_name": _candidate_name(row), "rendered_body": row["rendered_body"],
        "approver_initials": row.get("approver_initials"), "signed_at": row.get("candidate_signed_at"),
    }


def _send_final_copies(row: dict) -> None:
    title = row.get("title") or "Offer letter"
    name = _candidate_name(row)
    html_doc = build_letter_email_html(
        row["rendered_body"], f"The {title} for {name} has been approved and signed. This is the final copy for your records.", title,
    )
    emails, codes = _split_notify(row.get("notify_recipients") or [])
    to_all = list(dict.fromkeys([row["candidate_email"], HR_CONTACT, *emails]))
    for addr in to_all:
        email_service.send_email_detailed(
            addr, f"Signed: {title} | {name}", f"The {title} for {name} is approved and signed. The final copy is in this email.\n",
            kind="offer_signed", html=html_doc, reply_to=HR_CONTACT, letter_id=row["id"],
        )
    for code in codes:
        supabase.table("hr_offer_notices").insert({
            "letter_id": row["id"], "employee_code": code, "message": f"{name} accepted their {title}.",
        }).execute()


@router.post("/sign/{token}")
def sign(token: str, body: SignBody):
    row, role = _letter_by_token(token)
    if row["letter_type"] == onboarding_pipeline.NDA_TYPE:
        try:
            return onboarding_pipeline.nda_sign(row, role, body.signature, body.confirm)
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
        except PermissionError as e:
            raise HTTPException(status_code=409, detail=str(e))
    status = row.get("approval_status")
    title, name = row.get("title") or "Offer letter", _candidate_name(row)
    if role == "approver":
        if status != "awaiting_approval":
            raise HTTPException(status_code=409, detail="This offer has already been approved.")
        initials = re.sub(r"[^A-Za-z]", "", body.initials).upper()
        if not (1 <= len(initials) <= 6) or not body.confirm:
            raise HTTPException(status_code=400, detail="Enter your initials and tick the approval box")
        now = _now()
        stamped = row["rendered_body"] + _stamp("Approved", initials, f"Approved by {row['approver_email']} on {now[:10]}")
        ctoken = secrets.token_urlsafe(24)
        supabase.table("hr_generated_letters").update({
            "rendered_body": stamped, "approver_initials": initials, "approved_at": now,
            "approval_status": "awaiting_candidate", "candidate_token": ctoken,
        }).eq("id", row["id"]).execute()
        link = f"{APP_URL}/sign/{ctoken}"
        text = (
            f"Dear {name},\n\nYour {title} from JADE Lifestyles India is ready. Please read it and sign to accept: {link}\n\n"
            f"Questions? Write to {HR_CONTACT}.\n"
        )
        ok, err = email_service.send_email_detailed(
            row["candidate_email"], f"Your {title} from JADE Lifestyles India", text, kind="offer_candidate",
            reply_to=HR_CONTACT, letter_id=row["id"],
        )
        email_service.send_email_detailed(
            HR_CONTACT, f"Offer approved: {name}", f"{title} for {name} was approved ({initials}). It has been sent to {row['candidate_email']} to sign.\n",
            kind="offer_approved", reply_to=HR_CONTACT, letter_id=row["id"],
        )
        return {"ok": True, "status": "awaiting_candidate", "candidate_emailed": ok, "error": err}

    if status != "awaiting_candidate":
        raise HTTPException(status_code=409, detail="This offer has already been signed." if status == "accepted" else "This offer is not ready to sign yet.")
    signature = " ".join(body.signature.split())
    if len(signature) < 2 or not body.confirm:
        raise HTTPException(status_code=400, detail="Type your full name and tick the acceptance box")
    now = _now()
    stamped = row["rendered_body"] + _stamp("Accepted and signed", signature, f"Signed electronically on {now[:10]}")
    updated = supabase.table("hr_generated_letters").update({
        "rendered_body": stamped, "candidate_signature": signature, "candidate_signed_at": now, "approval_status": "accepted",
    }).eq("id", row["id"]).execute().data[0]
    _send_final_copies(updated)
    # Signing the offer starts the onboarding pipeline (NDA next). Never let
    # a pipeline problem fail the candidate's signature.
    try:
        onboarding_pipeline.start_from_offer(updated)
    except Exception:
        import logging
        logging.getLogger(__name__).exception("Could not start onboarding for offer %s", updated["id"])
    return {"ok": True, "status": "accepted"}


@router.get("/my-notices")
def my_notices(user: dict = Depends(get_current_user)):
    code = user.get("employee_code")
    if not code:
        return []
    return (
        supabase.table("hr_offer_notices").select("id,message,created_at,letter_id").eq("employee_code", code)
        .order("created_at", desc=True).limit(10).execute().data or []
    )
