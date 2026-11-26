"""Offer letter approval + e-sign flow.

HR issues an offer letter, then sends it for approval: the approver (Head-HR)
gets an emailed link, types their full name and signs; the candidate then
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
from auth import get_current_user, require_permission
from database import maybe_single_data, supabase
from letter_email import HR_CONTACT, build_letter_email_html

router = APIRouter(prefix="/api/offers", tags=["offers"])

APP_URL = "https://jade-hr.vercel.app"
DEFAULT_APPROVER = os.environ.get("OFFER_APPROVER_EMAIL") or "nimit.b@jadecouture.com"  # Head-HR; the form can name anyone else
ACCOUNTS_EMAIL = os.environ.get("OFFER_ACCOUNTS_EMAIL", "")
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s.]{1,255}(?:\.[^@\s.]{1,63}){1,8}$")  # no overlapping quantifiers: linear time


class SendForApproval(BaseModel):
    approver_email: str = ""
    candidate_email: str
    # Extra emails and/or employee codes that get the signed copy; codes
    # also see it on their dashboard.
    notify: list[str] = []
    include_accounts: bool = True


class SignBody(BaseModel):
    initials: str = ""
    signature: str = ""  # the signer's typed FULL name
    signature_image: str = ""  # PNG data URI of that name in a handwriting font, drawn in the browser
    confirm: bool = False


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _stamp(label: str, who: str, extra: str) -> str:
    return (
        '<div class="lt-accept" style="margin-top:1.2em"><span class="lt-label">' + html_lib.escape(label) + "</span>"
        f'<p style="font-family:Georgia,serif;font-size:20px;font-style:italic;margin:4px 0">{html_lib.escape(who)}</p>'
        f'<p style="font-size:11.5px;color:#666;margin:0">{html_lib.escape(extra)}</p></div>'
    )


SIGNATURE_FONT_STACK = "'Great Vibes','Brush Script MT','Segoe Script','Lucida Handwriting',cursive"


def _clean_full_name(raw: str) -> str:
    name = " ".join(re.sub(r"[^A-Za-z .'\-]", "", raw or "").split())
    if len(name) < 5 or " " not in name:
        raise HTTPException(status_code=400, detail="Type your full name (first and last name) to sign")
    return name


def _signature_html(name: str, image: str) -> str:
    """A handwriting-style signature: the PNG the browser drew (works in the
    PDF, print and the sign page), with a script-font text fallback."""
    if image.startswith("data:image/png;base64,") and len(image) < 200_000 and re.fullmatch(r"[A-Za-z0-9+/=:;,]+", image):
        return (
            f'<img src="{image}" alt="{html_lib.escape(name)}" '
            'style="height:58px;width:auto;display:block;margin:2px 0">'
        )
    return f'<span style="font-family:{SIGNATURE_FONT_STACK};font-size:34px;line-height:1.2;color:#1a2a6c">{html_lib.escape(name)}</span>'


def _place_signature(body_html: str, name: str, image: str) -> str:
    """Drop the signature into the letter's own signing space above the
    printed signatory name; letters without that block get it appended."""
    sig = _signature_html(name, image)
    marker = '<div class="lt-sign-space"></div>'
    if marker in body_html:
        return body_html.replace(marker, f'<div class="lt-sign-space" style="height:auto;min-height:40px">{sig}</div>', 1)
    return body_html + f'<div style="margin-top:1.2em">{sig}</div>'


def _letter_by_token(token: str) -> tuple[dict, str]:
    for col, role in (("approver_token", "approver"), ("candidate_token", "candidate")):
        row = maybe_single_data(supabase.table("hr_generated_letters").select("*").eq(col, token).maybe_single().execute())
        if row:
            return row, role
    raise HTTPException(status_code=404, detail="This link is not valid. Ask HR to send a fresh one.")


def _is_offer(row: dict) -> bool:
    return str(row.get("letter_type") or "").startswith("offer")


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
    if row.get("approval_status") in ("awaiting_candidate", "accepted", "signed"):
        raise HTTPException(status_code=409, detail="This letter is already signed off. It cannot be restarted.")
    # First signee from Team JADE: blank = Nimit (default); otherwise an email or an
    # employee ID. Never left without a usable address.
    approver_ref = (body.approver_email or "").strip()
    approver_person = None
    if approver_ref and "@" not in approver_ref:
        approver_person = maybe_single_data(
            supabase.table("hr_employees").select("id,first_name,last_name,email,designation").eq("employee_code", approver_ref).maybe_single().execute()
        )
        if not approver_person or not (approver_person.get("email") or "").strip():
            raise HTTPException(status_code=400, detail=f"No employee with a work email found for ID {approver_ref}")
        approver_ref = approver_person["email"]
    approver = (approver_ref or DEFAULT_APPROVER).strip().lower()
    if approver_person is None and approver != DEFAULT_APPROVER.lower():
        found = supabase.table("hr_employees").select("id,first_name,last_name,email,designation").ilike("email", approver.replace("%", "").replace("_", "\\_")).limit(1).execute().data
        approver_person = (found or [None])[0]
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
    update = {
        "approval_status": "awaiting_approval", "approver_email": approver, "approver_token": token,
        "candidate_email": candidate, "notify_recipients": recipients, "approver_initials": None, "approved_at": None,
    }
    if approver_person:
        # The printed signatory under the signature must be the person actually signing.
        new_name = f"{approver_person.get('first_name', '')} {approver_person.get('last_name') or ''}".strip()
        new_title = approver_person.get("designation") or ""
        body_html = row["rendered_body"]
        body_html = re.sub(r'(<span class="lt-sign-name"><strong>).*?(</strong></span>)', lambda m: m.group(1) + html_lib.escape(new_name) + m.group(2), body_html, count=1)
        if new_title:
            body_html = re.sub(r'(<span class="lt-sign-meta">).*?(</span>)', lambda m: m.group(1) + html_lib.escape(new_title) + m.group(2), body_html, count=1)
        fv = dict(row.get("field_values") or {})
        fv["signatory_name"] = new_name
        if new_title:
            fv["signatory_title"] = new_title
        update.update({"rendered_body": body_html, "field_values": fv})
    supabase.table("hr_generated_letters").update(update).eq("id", letter_id).execute()

    name, title = _candidate_name(row), row.get("title") or "Letter"
    link = f"{APP_URL}/sign/{token}"
    after = (
        "Once you approve, it goes to the candidate to sign and accept."
        if _is_offer(row) else "Once you sign, the signed copy goes to the recipient and HR."
    )
    text = (
        f"The {title} for {name} is ready for your e-signature.\n\n"
        f"Review it, type your full name and sign: {link}\n\n{after}"
    )
    subject = f"E-signature needed: {title} for {name}"
    ok, err = email_service.send_email_detailed(approver, subject, text, kind="offer_approval", reply_to=HR_CONTACT, letter_id=letter_id)
    if not ok:  # one retry, then never fail the request: the letter also pops up on the signee's dashboard
        ok, err = email_service.send_email_detailed(approver, subject, text, kind="offer_approval", reply_to=HR_CONTACT, letter_id=letter_id)
    if not ok:
        try:  # tell HR so the link is not lost
            email_service.send_email_detailed(
                HR_CONTACT, f"Could not email the e-sign link: {title} for {name}",
                f"The e-sign email to {approver} failed ({err}).\nShare this link with them directly: {link}\n",
                kind="offer_approval_failed", reply_to=HR_CONTACT, letter_id=letter_id,
            )
        except Exception:
            pass
    return {
        "ok": True, "approval_status": "awaiting_approval", "approver_email": approver, "email_sent": bool(ok),
        "sign_link": link, "warning": None if ok else f"The e-sign email could not be sent ({err}). It still shows on {approver}'s dashboard; you can also send them this link.",
        "signatory_name": (f"{approver_person.get('first_name', '')} {approver_person.get('last_name') or ''}".strip() if approver_person else None),
    }


@router.get("/sign/{token}")
def view_for_signing(token: str):
    row, role = _letter_by_token(token)
    status = row.get("approval_status")
    can_act = (role == "approver" and status == "awaiting_approval") or (role == "candidate" and status == "awaiting_candidate")
    return {
        "role": role, "status": status, "can_act": can_act, "title": row.get("title") or "Letter", "is_offer": _is_offer(row),
        "candidate_name": _candidate_name(row), "rendered_body": row["rendered_body"],
        "approver_initials": row.get("approver_initials"), "signed_at": row.get("candidate_signed_at"),
    }


def _send_final_copies(row: dict) -> None:
    title = row.get("title") or "Letter"
    name = _candidate_name(row)
    html_doc = build_letter_email_html(
        row["rendered_body"], f"The {title} for {name} has been approved and signed. This is the final copy for your records.", title,
    )
    emails, codes = _split_notify(row.get("notify_recipients") or [])
    to_all = list(dict.fromkeys([a for a in [row.get("candidate_email"), HR_CONTACT, *emails] if a]))
    # Runs AFTER the signature is saved: nothing here may ever turn a recorded
    # signature into an error, and one bad address must not stop the others.
    for addr in to_all:
        try:
            email_service.send_email_detailed(
                addr, f"Signed: {title} | {name}", f"The {title} for {name} is approved and signed. The final copy is in this email.\n",
                kind="offer_signed", html=html_doc, reply_to=HR_CONTACT, letter_id=row["id"],
            )
        except Exception:
            pass
    for code in codes:
        try:
            supabase.table("hr_offer_notices").insert({
                "letter_id": row["id"], "employee_code": code,
                "message": f"{name} accepted their {title}." if _is_offer(row) else f"{title} for {name} was signed.",
            }).execute()
        except Exception:
            pass


@router.post("/sign/{token}")
def sign(token: str, body: SignBody):
    row, role = _letter_by_token(token)
    status = row.get("approval_status")
    title, name = row.get("title") or "Letter", _candidate_name(row)
    if role == "approver":
        if status != "awaiting_approval":
            raise HTTPException(status_code=409, detail="This letter has already been signed.")
        full_name = _clean_full_name(body.signature)
        initials = "".join(w[0] for w in full_name.split() if w[0].isalpha()).upper()[:6]
        if not body.confirm:
            raise HTTPException(status_code=400, detail="Tick the box to confirm your signature")
        now = _now()
        if not _is_offer(row):
            # Non-offer letters need only the approver's e-signature: stamp it,
            # then send the signed copy to the recipient, HR and notify list.
            stamped = _place_signature(row["rendered_body"], full_name, body.signature_image) + _stamp(
                "Signed electronically", full_name, f"{row['approver_email']} on {now[:10]}")
            updated = supabase.table("hr_generated_letters").update({
                "rendered_body": stamped, "approver_initials": initials, "approved_at": now, "approval_status": "signed",
            }).eq("id", row["id"]).execute().data[0]
            _send_final_copies(updated)
            return {"ok": True, "status": "signed"}
        stamped = _place_signature(row["rendered_body"], full_name, body.signature_image) + _stamp(
            "Approved electronically", full_name, f"{row['approver_email']} on {now[:10]}")
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
    signature = _clean_full_name(body.signature)
    if not body.confirm:
        raise HTTPException(status_code=400, detail="Type your full name and tick the acceptance box")
    now = _now()
    stamped = row["rendered_body"] + f'<div style="margin-top:1em">{_signature_html(signature, body.signature_image)}</div>' + _stamp(
        "Accepted and signed", signature, f"Signed electronically on {now[:10]}")
    updated = supabase.table("hr_generated_letters").update({
        "rendered_body": stamped, "candidate_signature": signature, "candidate_signed_at": now, "approval_status": "accepted",
    }).eq("id", row["id"]).execute().data[0]
    _send_final_copies(updated)
    return {"ok": True, "status": "accepted"}


# --- e-sign prompt for the approver's own dashboard (no emailed link needed) ---

def _my_pending(user: dict) -> list[dict]:
    email = (user.get("email") or "").strip().lower()
    if not email:
        return []
    return (
        supabase.table("hr_generated_letters").select("*").eq("approval_status", "awaiting_approval")
        .eq("approver_email", email).order("created_at", desc=True).execute().data or []
    )


@router.get("/my-pending-signatures")
def my_pending_signatures(user: dict = Depends(get_current_user)):
    return [
        {"id": r["id"], "title": r.get("title") or "Letter", "candidate_name": _candidate_name(r),
         "is_offer": _is_offer(r), "rendered_body": r["rendered_body"], "created_at": r.get("created_at")}
        for r in _my_pending(user)
    ]


@router.post("/my-pending-signatures/{letter_id}/sign")
def sign_my_pending(letter_id: str, body: SignBody, user: dict = Depends(get_current_user)):
    row = next((r for r in _my_pending(user) if r["id"] == letter_id), None)
    if not row:
        raise HTTPException(status_code=404, detail="Nothing waiting for your signature on that letter")
    return sign(row["approver_token"], body)


@router.get("/my-notices")
def my_notices(user: dict = Depends(get_current_user)):
    code = user.get("employee_code")
    if not code:
        return []
    return (
        supabase.table("hr_offer_notices").select("id,message,created_at,letter_id").eq("employee_code", code)
        .order("created_at", desc=True).limit(10).execute().data or []
    )
