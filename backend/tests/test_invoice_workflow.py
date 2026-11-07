"""Drives the real invoice router end to end (submit -> verify -> approve ->
pay) against an in-memory stand-in for Supabase, capturing emails."""
import base64
import itertools

import pytest
from fastapi import HTTPException

import email_service
from models import InvoiceDecision, InvoicePay, InvoiceSubmit, OnboardingUpload
from routers import invoices

DOC = "ACME Textiles Pvt Ltd\nInvoice No: INV_2026_0042\nGrand Total Rs. 11,800.00"


class Q:
    def __init__(self, db, name):
        self.db, self.name, self.rows, self.f, self.op, self.payload, self.single = db, name, None, [], "select", None, False

    def select(self, *_a): return self
    def insert(self, row): self.op, self.payload = "insert", row; return self
    def update(self, row): self.op, self.payload = "update", row; return self
    def eq(self, k, v): self.f.append(lambda r: r.get(k) == v); return self
    def order(self, *_a, **_k): return self
    def limit(self, *_a): return self
    def maybe_single(self): self.single = True; return self

    @property
    def not_(self): return self

    def in_(self, k, vals):
        self.f.append(lambda r: r.get(k) not in vals)  # only used via not_ in this router
        return self

    def execute(self):
        table = self.db.tables.setdefault(self.name, [])
        match = [r for r in table if all(f(r) for f in self.f)]
        if self.op == "insert":
            row = {"id": f"id{next(self.db.ids)}", "reference_no": 5000 + next(self.db.ids), "submitted_at": "2026-11-07T00:00:00+00:00", "status": "pending_verification", **self.payload}
            table.append(row)
            return type("R", (), {"data": [dict(row)]})
        if self.op == "update":
            for r in match: r.update(self.payload)
            return type("R", (), {"data": [dict(r) for r in match]})
        data = [dict(r) for r in match]
        return type("R", (), {"data": (data[0] if data else None) if self.single else data})


class Bucket:
    def __init__(self, db): self.db = db
    def upload(self, path, data, _o): self.db.files[path] = data
    def download(self, path):
        if path not in self.db.files: raise KeyError(path)
        return self.db.files[path]
    def create_signed_url(self, path, _t): return {"signedURL": f"https://signed/{path}"}


class DB:
    def __init__(self):
        self.tables, self.files, self.ids = {}, {}, itertools.count(1)
        self.storage = type("S", (), {"from_": lambda _s, _b: Bucket(self)})()

    def table(self, name): return Q(self, name)


@pytest.fixture
def env(monkeypatch):
    db, sent = DB(), []
    monkeypatch.setattr(invoices, "supabase", db)
    monkeypatch.setattr(invoices, "maybe_single_data", lambda r: r.data)
    monkeypatch.setattr(invoices, "extract_text", lambda data, ct: data.decode() if ct == "application/pdf" else "")
    monkeypatch.setattr(email_service, "send_email_detailed", lambda to, subject, body, **k: sent.append((to, subject, body)) or (True, None))
    monkeypatch.setattr(invoices, "ACCOUNTING_EMAIL", "accounts@example.com")
    return db, sent


def upload(text=DOC, ct="application/pdf"):
    return invoices.upload_attachment(OnboardingUpload(filename="x", content_type=ct, content_base64=base64.b64encode(text.encode()).decode()))["path"]


def submit(path, number="INV_2026_0042", amount=11800, email="v@acme.com"):
    return invoices.submit_invoice(InvoiceSubmit(vendor_name="ACME", vendor_email=email, vendor_phone="999", invoice_number=number, amount=amount, attachment_path=path))


APPROVER = {"id": "u1", "first_name": "Asha", "last_name": "Rao"}


def test_happy_path_submit_verify_approve_pay(env):
    db, sent = env
    out = submit(upload())
    assert out["status"] == "verified" and out["reference_no"]
    inv_id = db.tables["hr_invoices"][0]["id"]

    invoices.approve_invoice(inv_id, InvoiceDecision(note="ok"), APPROVER)
    row = db.tables["hr_invoices"][0]
    assert row["status"] == "approved" and row["approved_by"] == "u1"
    assert any(to == "accounts@example.com" and "approved" in subj.lower() for to, subj, _ in sent)

    invoices.mark_paid(inv_id, InvoicePay(payment_ref="UTR1"), APPROVER)
    assert db.tables["hr_invoices"][0]["status"] == "paid"
    actions = [e["action"] for e in db.tables["hr_invoice_events"]]
    assert actions == ["submitted", "approved", "paid"]
    assert any(to == "v@acme.com" and "payment" in subj.lower() for to, subj, _ in sent)


def test_mismatch_rejected_and_vendor_told_why(env):
    db, sent = env
    out = submit(upload(), amount=9999)
    assert out["status"] == "verification_rejected" and "not found" in out["reason"]
    assert sent[-1][0] == "v@acme.com" and "could not be verified" in sent[-1][1]
    with pytest.raises(HTTPException) as e:  # a rejected invoice can't be approved
        invoices.approve_invoice(db.tables["hr_invoices"][0]["id"], InvoiceDecision(), APPROVER)
    assert e.value.status_code == 409


def test_underscore_invoice_numbers_are_not_wildcard_duplicates(env):
    db, _ = env
    submit(upload("Invoice No: INV_1\nTotal 500.00"), number="INV_1", amount=500)
    out = submit(upload("Invoice No: INVX1\nTotal 500.00"), number="INVX1", amount=500)
    assert out["status"] == "verified"  # not flagged as a duplicate of INV_1
    dup = submit(upload("Invoice No: INV_1\nTotal 500.00"), number="inv_1", amount=500)
    assert dup["status"] == "verification_rejected" and "already submitted" in dup["reason"]


def test_unreadable_image_waits_for_manual_check_then_flows(env):
    db, _ = env
    out = submit(upload("img", "image/png"))
    assert out["status"] == "pending_verification"
    inv_id = db.tables["hr_invoices"][0]["id"]
    with pytest.raises(HTTPException):  # can't approve before verification
        invoices.approve_invoice(inv_id, InvoiceDecision(), APPROVER)
    invoices.manual_verify(inv_id, InvoiceDecision(note="checked"), True, APPROVER)
    assert db.tables["hr_invoices"][0]["status"] == "verified"
    invoices.approve_invoice(inv_id, InvoiceDecision(), APPROVER)


def test_reasons_required_and_order_enforced(env):
    db, _ = env
    submit(upload())
    inv_id = db.tables["hr_invoices"][0]["id"]
    with pytest.raises(HTTPException) as e:
        invoices.reject_invoice(inv_id, InvoiceDecision(note=" "), APPROVER)
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:  # can't pay before approval
        invoices.mark_paid(inv_id, InvoicePay(), APPROVER)
    assert e.value.status_code == 409
    invoices.approve_invoice(inv_id, InvoiceDecision(), APPROVER)
    with pytest.raises(HTTPException) as e:  # no second approval
        invoices.approve_invoice(inv_id, InvoiceDecision(), APPROVER)
    assert e.value.status_code == 409


def test_vendor_tracking_needs_matching_email(env):
    db, _ = env
    ref = submit(upload())["reference_no"]
    db.tables["hr_invoices"][0]["reference_no"] = ref
    # the stand-in can't filter by reference_no via .eq on the selected row; check the guard directly
    ok = invoices.track_invoice(ref, "V@acme.com")
    assert ok["status_label"] and "vendor_email" not in ok
    with pytest.raises(HTTPException) as e:
        invoices.track_invoice(ref, "stranger@x.com")
    assert e.value.status_code == 404


def test_bad_uploads_and_submissions_refused(env):
    with pytest.raises(HTTPException):
        invoices.upload_attachment(OnboardingUpload(filename="x.exe", content_type="application/x-msdownload", content_base64="AAAA"))
    with pytest.raises(HTTPException):
        submit("../../etc/passwd")
    with pytest.raises(HTTPException):
        submit(upload(), email="not-an-email")
    with pytest.raises(HTTPException):
        submit(upload(), amount=0)
