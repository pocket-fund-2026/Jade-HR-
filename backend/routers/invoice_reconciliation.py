"""Reconcile vendor invoices against the bank statement.

Accounting uploads the statement, the system PROPOSES matches
(invoice_reconcile.py), a person confirms, and only then is an approved
invoice marked paid. Re-importing a statement is harmless (line hashes)."""
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import require_permission
from database import maybe_single_data, supabase
from invoice_reconcile import match_lines, parse_statement
from models import ReconcileConfirm, ReconcilePreview
from routers.invoices import STATUS_LABEL, _log

router = APIRouter(prefix="/api/invoices/reconcile", tags=["invoice-reconciliation"])

INV_COLS = "id,reference_no,vendor_name,invoice_number,amount,status,approved_at,paid_at,payment_ref"


def _invoices() -> list[dict]:
    return supabase.table("hr_invoices").select(INV_COLS).execute().data or []


def _payments() -> list[dict]:
    try:
        return supabase.table("hr_invoice_payments").select("*").execute().data or []
    except Exception:
        raise HTTPException(status_code=503, detail="Reconciliation is not set up yet (run sql/082_invoice_reconciliation.sql)")


@router.post("/preview")
def preview(body: ReconcilePreview, user: dict = Depends(require_permission("invoices.reconcile"))):
    if len(body.csv_text) > 2_000_000:
        raise HTTPException(status_code=413, detail="Statement too large — upload one month at a time")
    try:
        parsed = parse_statement(body.csv_text)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    invoices, payments = _invoices(), _payments()
    results = match_lines(
        parsed["lines"], invoices,
        already_matched_hashes={p["line_hash"] for p in payments},
        reconciled_invoice_ids={p["invoice_id"] for p in payments if p.get("invoice_id")},
    )
    counts: dict[str, int] = {}
    for r in results:
        counts[r["status"]] = counts.get(r["status"], 0) + 1
    open_invoices = [
        {"id": i["id"], "label": f"{i['vendor_name']} · {i['invoice_number']} · ₹{float(i['amount']):,.2f}"}
        for i in invoices if i["status"] == "approved"
    ]
    return {"lines": results, "counts": counts, "skipped": parsed["skipped"], "columns": parsed["columns"], "open_invoices": open_invoices}


@router.post("/confirm")
def confirm(body: ReconcileConfirm, user: dict = Depends(require_permission("invoices.reconcile"))):
    """Saves the confirmed matches. An approved invoice becomes paid (paid date
    = the bank date, reference = the bank reference); an already-paid one is
    just linked to its bank line. A line with no invoice is recorded as an
    unmatched payment so it shows up for follow-up and isn't imported twice."""
    payments = _payments()
    known_hashes = {p["line_hash"] for p in payments}
    linked_invoices = {p["invoice_id"] for p in payments if p.get("invoice_id")}
    outcomes = []
    for m in body.matches:
        def out(status, detail=""):
            outcomes.append({"hash": m.hash, "status": status, "detail": detail})
        if m.hash in known_hashes:
            out("skipped", "Already reconciled earlier")
            continue
        try:
            bank_date = date.fromisoformat(m.date)
        except ValueError:
            out("error", "Bad date")
            continue
        row = {"line_hash": m.hash, "bank_date": m.date, "description": m.description[:500], "reference": m.reference[:100],
               "amount": m.amount_paise / 100, "note": m.note[:500], "matched_by": user["id"]}
        if m.invoice_id:
            inv = maybe_single_data(supabase.table("hr_invoices").select("*").eq("id", m.invoice_id).maybe_single().execute())
            if not inv:
                out("error", "Invoice not found")
                continue
            if inv["status"] not in ("approved", "paid"):
                out("error", f"Invoice is '{STATUS_LABEL[inv['status']]}', only approved or paid invoices can be reconciled")
                continue
            if m.invoice_id in linked_invoices:
                out("error", "That invoice is already reconciled to another bank line")
                continue
            diff = m.amount_paise - round(float(inv["amount"]) * 100)
            row.update({"invoice_id": m.invoice_id, "difference": diff / 100})
            if inv["status"] == "approved":
                moved = (
                    supabase.table("hr_invoices")
                    .update({"status": "paid", "paid_by": user["id"], "paid_at": datetime(bank_date.year, bank_date.month, bank_date.day, tzinfo=timezone.utc).isoformat(),
                             "payment_ref": m.reference[:100]})
                    .eq("id", m.invoice_id).eq("status", "approved").execute().data
                )
                if not moved:
                    out("error", "The invoice changed while you were reconciling — refresh and try again")
                    continue
            supabase.table("hr_invoice_payments").insert(row).execute()
            linked_invoices.add(m.invoice_id)
            known_hashes.add(m.hash)
            _log(m.invoice_id, "reconciled", user,
                 f"Bank line {m.date} ₹{m.amount_paise / 100:,.2f} ref {m.reference or '—'}" + (f", differs by {diff / 100:+,.2f}" if diff else ""))
            out("matched", f"Paid, differs by {diff / 100:+,.2f}" if diff else "Paid")
        else:
            supabase.table("hr_invoice_payments").insert(row).execute()
            known_hashes.add(m.hash)
            out("recorded", "Recorded as an unmatched payment")
    return {"outcomes": outcomes}


@router.get("/summary")
def summary(user: dict = Depends(require_permission("invoices.reconcile", "invoices.view"))):
    """Where the money stands: outstanding by vendor and age, paid-but-not-in-bank,
    payments with no invoice, and payments that didn't equal the invoice."""
    invoices = {i["id"]: i for i in _invoices()}
    payments = _payments()
    by_invoice = {p["invoice_id"]: p for p in payments if p.get("invoice_id")}
    today = date.today()

    def age(i):
        ts = i.get("approved_at")
        return (today - datetime.fromisoformat(ts.replace("Z", "+00:00")).date()).days if ts else 0

    outstanding = [i for i in invoices.values() if i["status"] == "approved"]
    buckets = {"0-7 days": 0.0, "8-30 days": 0.0, "31-60 days": 0.0, "60+ days": 0.0}
    for i in outstanding:
        a = age(i)
        buckets["0-7 days" if a <= 7 else "8-30 days" if a <= 30 else "31-60 days" if a <= 60 else "60+ days"] += float(i["amount"])

    vendors: dict[str, dict] = {}
    for i in invoices.values():
        v = vendors.setdefault(i["vendor_name"], {"vendor": i["vendor_name"], "invoiced": 0.0, "paid": 0.0, "outstanding": 0.0, "count": 0})
        v["count"] += 1
        if i["status"] in ("approved", "paid"):
            v["invoiced"] += float(i["amount"])
        if i["status"] == "paid":
            v["paid"] += float(i["amount"])
        if i["status"] == "approved":
            v["outstanding"] += float(i["amount"])

    def brief(i, **extra):
        return {"id": i["id"], "reference_no": i["reference_no"], "vendor_name": i["vendor_name"], "invoice_number": i["invoice_number"], "amount": float(i["amount"]), **extra}

    return {
        "outstanding": sorted([brief(i, age_days=age(i)) for i in outstanding], key=lambda r: -r["age_days"]),
        "aging": buckets,
        "paid_not_in_bank": [brief(i) for i in invoices.values() if i["status"] == "paid" and i["id"] not in by_invoice],
        "unmatched_payments": [p for p in payments if not p.get("invoice_id")],
        "paid_with_difference": [brief(invoices[p["invoice_id"]], difference=float(p["difference"]), bank_amount=float(p["amount"]))
                                 for p in payments if p.get("invoice_id") in invoices and abs(float(p["difference"])) >= 0.01],
        "vendors": sorted(vendors.values(), key=lambda v: -v["outstanding"]),
    }
