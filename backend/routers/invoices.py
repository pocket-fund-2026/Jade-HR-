"""Vendor invoices: public submission link -> automatic verification ->
approval -> accounting notified -> paid. Every step is written to
hr_invoice_events with who did it (the approver ID is also on the invoice)."""
import base64
import html
import logging
import os
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

import email_service
from auth import require_permission
from database import maybe_single_data, supabase
from invoice_check import extract_fields, extract_text, verify
from models import InvoiceDecision, InvoicePay, InvoiceSubmit, OnboardingUpload

router = APIRouter(prefix="/api/invoices", tags=["invoices"])
log = logging.getLogger("invoices")

BUCKET = "invoice-documents"
MAX_UPLOAD_BYTES = 3 * 1024 * 1024  # base64 inflates ~33%; Vercel caps a request body at 4.5 MB
ALLOWED_TYPES = {"application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp"}
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
# Who hears about approvals/rejections. Falls back to the HR notify address
# so nothing is silently dropped if no accounting inbox has been set.
ACCOUNTING_EMAIL = os.environ.get("INVOICE_ACCOUNTING_EMAIL") or email_service.HR_NOTIFY_EMAIL

STATUS_LABEL = {
    "pending_verification": "Awaiting verification",
    "verification_rejected": "Verification rejected",
    "verified": "Verified, awaiting approval",
    "approved": "Approved, payment pending",
    "rejected": "Rejected",
    "paid": "Paid",
}


def _log(invoice_id: str, action: str, actor: dict | None, note: str = "") -> None:
    try:
        supabase.table("hr_invoice_events").insert({
            "invoice_id": invoice_id, "action": action, "note": note,
            "actor_id": actor["id"] if actor else None,
            "actor_label": (f"{actor.get('first_name', '')} {actor.get('last_name') or ''}".strip() if actor else "System / vendor"),
        }).execute()
    except Exception:
        pass  # the audit log must never block the workflow step itself


def _mail(to: str, subject: str, lines: list[str]) -> None:
    if not to:
        return
    text = "\n".join(lines)
    body = "".join(f"<p>{html.escape(ln)}</p>" if ln else "" for ln in lines)
    try:
        email_service.send_email_detailed(to, subject, text, kind="invoice", html=body)
    except Exception:
        pass


def _summary(inv: dict) -> list[str]:
    return [
        f"Vendor: {inv['vendor_name']}",
        f"Invoice: {inv['invoice_number']} (ref #{inv['reference_no']})",
        f"Amount: {float(inv['amount']):,.2f}",
    ]


def _signed_url(path: str | None) -> str | None:
    if not path:
        return None
    try:
        resp = supabase.storage.from_(BUCKET).create_signed_url(path, 3600)
        return resp.get("signedURL") or resp.get("signed_url")
    except Exception:
        return None


# ── Public: vendor submission ───────────────────────────────────────────────


@router.post("/upload")
def upload_attachment(body: OnboardingUpload):
    """Public — vendors have no login. One file per call, PDF or image."""
    if body.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Please attach a PDF, PNG, JPG or WEBP file")
    try:
        data = base64.b64decode(body.content_base64.split(",", 1)[-1])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid file data")
    if not data or len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File must be under 3MB")
    now = datetime.now(timezone.utc)
    path = f"{now.strftime('%Y%m%d_%H%M%S')}_{now.microsecond}.{ALLOWED_TYPES[body.content_type]}"
    try:
        supabase.storage.from_(BUCKET).upload(path, data, {"content-type": body.content_type})
    except Exception:
        log.exception("invoice attachment upload failed")
        # Most likely the invoice-documents bucket doesn't exist yet (sql/081 not applied).
        raise HTTPException(status_code=503, detail="Invoice submission isn't open yet. Please try again later or contact JADE accounts.")
    return {"path": path, "content_type": body.content_type}


@router.post("/submit")
def submit_invoice(body: InvoiceSubmit):
    name, email, phone = body.vendor_name.strip(), body.vendor_email.strip().lower(), body.vendor_phone.strip()
    number = body.invoice_number.strip()
    if not (name and phone and number):
        raise HTTPException(status_code=400, detail="Vendor name, phone and invoice number are required")
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Enter a valid email address")
    if not (0 < body.amount < 1_000_000_000):
        raise HTTPException(status_code=400, detail="Enter a valid amount")
    if not re.fullmatch(r"[0-9]{8}_[0-9]{6}_[0-9]+\.(pdf|png|jpg|webp)", body.attachment_path):
        raise HTTPException(status_code=400, detail="Attach the invoice (PDF or image) before submitting")

    ext = body.attachment_path.rsplit(".", 1)[-1]
    content_type = {v: k for k, v in ALLOWED_TYPES.items()}[ext]
    try:
        data = supabase.storage.from_(BUCKET).download(body.attachment_path)
    except Exception:
        raise HTTPException(status_code=400, detail="The attachment could not be found — please upload it again")

    text = extract_text(data, content_type)
    # Compared in Python: ilike treats "_" and "%" in an invoice number as wildcards.
    same_vendor = (
        supabase.table("hr_invoices").select("invoice_number")
        .eq("vendor_email", email).not_.in_("status", ["verification_rejected", "rejected"]).execute().data or []
    )
    dup = [r for r in same_vendor if r["invoice_number"].strip().lower() == number.lower()]
    outcome = verify(number, body.amount, text, has_attachment=True, duplicate=bool(dup))
    status = {"passed": "verified", "rejected": "verification_rejected", "manual": "pending_verification"}[outcome["result"]]
    failed = "; ".join(c["detail"] for c in outcome["checks"] if not c["ok"])

    extracted = extract_fields(text)
    extracted["submitter"] = {"name": name, "email": email, "phone": phone}
    row = {
        "vendor_name": name, "vendor_email": email, "vendor_phone": phone, "invoice_number": number,
        "amount": body.amount, "invoice_date": body.invoice_date.isoformat() if body.invoice_date else None,
        "bill_details": body.bill_details.strip(), "attachment_path": body.attachment_path,
        "attachment_type": content_type, "extracted": extracted, "status": status,
        "verification_source": "auto", "verification_checks": outcome["checks"],
        "verification_note": failed if status == "verification_rejected" else "",
    }
    try:
        inv = supabase.table("hr_invoices").insert(row).execute().data[0]
    except Exception:
        log.exception("invoice insert failed")
        raise HTTPException(status_code=503, detail="Invoice submission isn't open yet. Please try again later or contact JADE accounts.")
    _log(inv["id"], "submitted", None, f"Auto-verification: {outcome['result']}" + (f" ({failed})" if failed else ""))

    ref = inv["reference_no"]
    if status == "verification_rejected":
        _mail(email, f"Invoice {number} could not be verified (ref #{ref})",
              [f"Hello {name},", "", f"We could not verify invoice {number} (ref #{ref}).", f"Reason: {failed}", "",
               "Please check the details and submit it again from the same link."])
    else:
        _mail(email, f"Invoice {number} received (ref #{ref})",
              [f"Hello {name},", "", f"We have received invoice {number} for {body.amount:,.2f}.",
               f"Your reference number is #{ref}. You can track it from the submission page."])
    return {"reference_no": ref, "status": status, "status_label": STATUS_LABEL[status], "reason": failed if status == "verification_rejected" else ""}


@router.get("/track")
def track_invoice(reference_no: int = Query(...), email: str = Query(...)):
    """Public — a vendor checks progress with the reference number AND the
    email they submitted with (so refs can't be enumerated by strangers)."""
    row = maybe_single_data(
        supabase.table("hr_invoices")
        .select("reference_no,invoice_number,amount,status,verification_note,decision_note,submitted_at,paid_at,vendor_email")
        .eq("reference_no", reference_no).maybe_single().execute()
    )
    if not row or row["vendor_email"].lower() != email.strip().lower():
        raise HTTPException(status_code=404, detail="No invoice found for that reference and email")
    row.pop("vendor_email")
    row["status_label"] = STATUS_LABEL[row["status"]]
    return row


# ── Accounting side ─────────────────────────────────────────────────────────

LIST_COLS = "id,reference_no,vendor_name,vendor_email,invoice_number,amount,invoice_date,status,submitted_at,extracted,attachment_type,approved_at,paid_at"


@router.get("")
def list_invoices(
    status: str | None = Query(default=None),
    q: str | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    user: dict = Depends(require_permission("invoices.view")),
):
    query = supabase.table("hr_invoices").select(LIST_COLS).order("submitted_at", desc=True).limit(limit)
    if status:
        query = query.eq("status", status)
    rows = query.execute().data or []
    if q:
        needle = q.strip().lower()
        rows = [
            r for r in rows
            if needle in " ".join([r["vendor_name"], r["vendor_email"], r["invoice_number"], str(r["reference_no"]),
                                   (r.get("extracted") or {}).get("company_name") or ""]).lower()
        ]
    return rows


@router.get("/{invoice_id}")
def get_invoice(invoice_id: str, user: dict = Depends(require_permission("invoices.view"))):
    inv = maybe_single_data(supabase.table("hr_invoices").select("*").eq("id", invoice_id).maybe_single().execute())
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    events = supabase.table("hr_invoice_events").select("*").eq("invoice_id", invoice_id).order("created_at").execute().data or []
    return {**inv, "attachment_url": _signed_url(inv["attachment_path"]), "events": events, "status_label": STATUS_LABEL[inv["status"]]}


def _load(invoice_id: str, allowed: set[str], action: str) -> dict:
    inv = maybe_single_data(supabase.table("hr_invoices").select("*").eq("id", invoice_id).maybe_single().execute())
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if inv["status"] not in allowed:
        raise HTTPException(status_code=409, detail=f"Cannot {action} an invoice that is '{STATUS_LABEL[inv['status']]}'")
    return inv


def _update(invoice_id: str, fields: dict, from_status: str) -> dict:
    """Only moves the invoice if it is still in the status we checked, so two
    people clicking at once can't both approve (and double-email) it."""
    rows = supabase.table("hr_invoices").update(fields).eq("id", invoice_id).eq("status", from_status).execute().data
    if not rows:
        raise HTTPException(status_code=409, detail="Someone else just changed this invoice — refresh and check its status")
    return rows[0]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.post("/{invoice_id}/verify")
def manual_verify(invoice_id: str, body: InvoiceDecision, passed: bool = Query(...), user: dict = Depends(require_permission("invoices.verify"))):
    """A person's call on an invoice the automatic check couldn't settle (or
    overriding it). Rejecting needs a reason — the vendor is emailed it."""
    inv = _load(invoice_id, {"pending_verification", "verification_rejected", "verified"}, "verify")
    if not passed and not body.note.strip():
        raise HTTPException(status_code=400, detail="Give a reason so the vendor knows what to fix")
    status = "verified" if passed else "verification_rejected"
    out = _update(invoice_id, {
        "status": status, "verification_source": "manual", "verified_by": user["id"], "verified_at": _now(),
        "verification_note": "" if passed else body.note.strip(),
    }, inv["status"])
    _log(invoice_id, "verified_manually" if passed else "verification_rejected", user, body.note)
    if not passed:
        _mail(inv["vendor_email"], f"Invoice {inv['invoice_number']} could not be verified (ref #{inv['reference_no']})",
              [f"Hello {inv['vendor_name']},", "", f"We could not verify invoice {inv['invoice_number']}.", f"Reason: {body.note.strip()}", "",
               "Please correct it and submit again from the same link."])
    return out


@router.post("/{invoice_id}/approve")
def approve_invoice(invoice_id: str, body: InvoiceDecision, user: dict = Depends(require_permission("invoices.approve"))):
    inv = _load(invoice_id, {"verified"}, "approve")  # verification always comes first
    out = _update(invoice_id, {"status": "approved", "approved_by": user["id"], "approved_at": _now(), "decision_note": body.note.strip()}, "verified")
    _log(invoice_id, "approved", user, body.note)
    approver = f"{user.get('first_name', '')} {user.get('last_name') or ''}".strip()
    _mail(ACCOUNTING_EMAIL, f"Invoice approved for payment — {inv['vendor_name']} #{inv['reference_no']}",
          [*_summary(inv), f"Approved by: {approver}", f"Note: {body.note.strip() or '—'}", "", "Please arrange payment and mark it paid in the HR console."])
    return out


@router.post("/{invoice_id}/reject")
def reject_invoice(invoice_id: str, body: InvoiceDecision, user: dict = Depends(require_permission("invoices.approve"))):
    inv = _load(invoice_id, {"verified"}, "reject")
    if not body.note.strip():
        raise HTTPException(status_code=400, detail="Give a reason for rejecting")
    out = _update(invoice_id, {"status": "rejected", "approved_by": user["id"], "approved_at": _now(), "decision_note": body.note.strip()}, "verified")
    _log(invoice_id, "rejected", user, body.note)
    approver = f"{user.get('first_name', '')} {user.get('last_name') or ''}".strip()
    _mail(ACCOUNTING_EMAIL, f"Invoice rejected — {inv['vendor_name']} #{inv['reference_no']}",
          [*_summary(inv), f"Rejected by: {approver}", f"Reason: {body.note.strip()}"])
    _mail(inv["vendor_email"], f"Invoice {inv['invoice_number']} was not approved (ref #{inv['reference_no']})",
          [f"Hello {inv['vendor_name']},", "", f"Invoice {inv['invoice_number']} was not approved.", f"Reason: {body.note.strip()}"])
    return out


@router.post("/{invoice_id}/pay")
def mark_paid(invoice_id: str, body: InvoicePay, user: dict = Depends(require_permission("invoices.pay"))):
    inv = _load(invoice_id, {"approved"}, "mark as paid")
    out = _update(invoice_id, {"status": "paid", "paid_by": user["id"], "paid_at": _now(), "payment_ref": body.payment_ref.strip()}, "approved")
    _log(invoice_id, "paid", user, f"Payment ref: {body.payment_ref.strip() or '—'}" + (f". {body.note}" if body.note else ""))
    _mail(inv["vendor_email"], f"Payment made for invoice {inv['invoice_number']} (ref #{inv['reference_no']})",
          [f"Hello {inv['vendor_name']},", "", f"Payment for invoice {inv['invoice_number']} ({float(inv['amount']):,.2f}) has been made.",
           f"Payment reference: {body.payment_ref.strip() or '—'}"])
    return out
