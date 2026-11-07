import pytest
from fastapi import HTTPException

from invoice_reconcile import match_lines, paise, parse_statement
from models import ReconcileConfirm, ReconcileLine, ReconcilePreview
from routers import invoice_reconciliation as rec
from tests.test_invoice_workflow import DB, env  # noqa: F401  (fixture + in-memory db)

STATEMENT = """HDFC Bank Statement,,,,,,
Account No,5010012345,,,,,
Txn Date,Value Date,Narration,Chq/Ref No,Withdrawal Amt.,Deposit Amt.,Balance
01/11/2026,01/11/2026,NEFT-ACME TEXTILES-INV_2026_0042,UTR123456,"11,800.00",,5000
02/11/2026,02/11/2026,SALARY CREDIT,X1,,"50,000.00",9000
03/11/2026,03/11/2026,NEFT-ZEDDY CO INV Z-100,UTR999,"2,300.00",,100
04/11/2026,04/11/2026,NEFT-RANDOM PAYEE,UTR555,"777.00",,50
"""


def inv(id, number, vendor, amount, status="approved", **kw):
    return {"id": id, "reference_no": 1, "invoice_number": number, "vendor_name": vendor, "amount": amount, "status": status,
            "approved_at": "2026-10-20T00:00:00+00:00", "payment_ref": "", **kw}


def test_paise_handles_bank_formats():
    assert paise("1,23,456.50") == 12345650
    assert paise("(500.00)") == 50000
    assert paise("Rs. 99") == 9900
    assert paise("500.00 Dr") == 50000
    assert paise("") is None and paise("-") is None


def test_statement_parsing_skips_preamble_and_credits():
    p = parse_statement(STATEMENT)
    assert [l["amount_paise"] for l in p["lines"]] == [1180000, 230000, 77700]  # the salary credit is ignored
    assert p["lines"][0]["reference"] == "UTR123456"


def test_single_amount_column_with_negative_debits():
    p = parse_statement("Date,Description,Amount\n01-11-2026,Pay ACME,-500.00\n02-11-2026,Refund in,200.00\n")
    assert [l["amount_paise"] for l in p["lines"]] == [50000]


def test_unreadable_statement_gives_plain_error():
    with pytest.raises(ValueError):
        parse_statement("hello,world\n1,2\n")


def test_matching_statuses():
    lines = parse_statement(STATEMENT)["lines"]
    invoices = [inv("a", "INV_2026_0042", "ACME Textiles Pvt Ltd", 11800), inv("b", "Z-100", "Zeddy Co", 2400)]
    by_amount = {r["amount_paise"]: r for r in match_lines(lines, invoices)}
    assert by_amount[1180000]["status"] == "matched" and by_amount[1180000]["invoice_id"] == "a"
    short = by_amount[230000]
    assert short["status"] == "amount_mismatch" and short["diff_paise"] == -10000 and short["invoice_id"] == "b"
    assert by_amount[77700]["status"] == "unmatched"


def test_vendor_and_amount_only_needs_review():
    lines = [{"date": "2026-11-01", "description": "NEFT ACME TEXTILES", "reference": "", "amount_paise": 500000, "hash": "h"}]
    out = match_lines(lines, [inv("a", "INV-9", "ACME Textiles", 5000)])
    assert out[0]["status"] == "review"


def test_second_payment_for_same_invoice_is_a_duplicate():
    lines = [
        {"date": "2026-11-01", "description": "INV-9 ACME", "reference": "U1", "amount_paise": 500000, "hash": "h1"},
        {"date": "2026-11-02", "description": "INV-9 ACME", "reference": "U2", "amount_paise": 500000, "hash": "h2"},
    ]
    out = match_lines(lines, [inv("a", "INV-9", "ACME Textiles", 5000)])
    assert sorted(r["status"] for r in out) == ["duplicate_payment", "matched"]
    out = match_lines(lines[:1], [inv("a", "INV-9", "ACME Textiles", 5000)], reconciled_invoice_ids={"a"})
    assert out[0]["status"] == "duplicate_payment"
    out = match_lines(lines[:1], [inv("a", "INV-9", "ACME Textiles", 5000)], already_matched_hashes={"h1"})
    assert out[0]["status"] == "already_imported"


@pytest.fixture(autouse=True)
def _same_db(env, monkeypatch):  # noqa: F811
    monkeypatch.setattr(rec, "supabase", env[0])
    monkeypatch.setattr(rec, "maybe_single_data", lambda r: r.data)


USER = {"id": "u9", "first_name": "Accounts", "last_name": "User"}


def seed(db):
    db.tables["hr_invoices"] = [
        inv("a", "INV_2026_0042", "ACME Textiles Pvt Ltd", 11800, reference_no=5001),
        inv("b", "Z-100", "Zeddy Co", 2400, reference_no=5002),
        inv("c", "OLD-1", "Old Vendor", 100, status="paid", reference_no=5003),
    ]
    db.tables["hr_invoice_payments"] = []


def test_preview_confirm_summary_flow(env):  # noqa: F811
    db, _ = env
    seed(db)
    prev = rec.preview(ReconcilePreview(csv_text=STATEMENT), USER)
    assert prev["counts"] == {"matched": 1, "amount_mismatch": 1, "unmatched": 1}
    assert len(prev["open_invoices"]) == 2

    lines = {l["amount_paise"]: l for l in prev["lines"]}
    pick = lambda l, iid: ReconcileLine(hash=l["hash"], date=l["date"], description=l["description"], reference=l["reference"], amount_paise=l["amount_paise"], invoice_id=iid)
    res = rec.confirm(ReconcileConfirm(matches=[pick(lines[1180000], "a"), pick(lines[230000], "b"), pick(lines[77700], None)]), USER)
    assert [o["status"] for o in res["outcomes"]] == ["matched", "matched", "recorded"]

    a = next(i for i in db.tables["hr_invoices"] if i["id"] == "a")
    assert a["status"] == "paid" and a["payment_ref"] == "UTR123456" and a["paid_by"] == "u9"
    assert any(e["action"] == "reconciled" for e in db.tables["hr_invoice_events"])

    # importing the same statement again changes nothing
    again = rec.preview(ReconcilePreview(csv_text=STATEMENT), USER)
    assert again["counts"] == {"already_imported": 3}
    assert [o["status"] for o in rec.confirm(ReconcileConfirm(matches=[pick(lines[1180000], "a")]), USER)["outcomes"]] == ["skipped"]

    s = rec.summary(USER)
    assert [p["amount"] for p in s["unmatched_payments"]] == [777.0]
    assert s["paid_with_difference"][0]["difference"] == -100.0
    assert [i["invoice_number"] for i in s["paid_not_in_bank"]] == ["OLD-1"]  # marked paid but never seen in the bank
    assert s["outstanding"] == []


def test_cannot_reconcile_unapproved_or_double_link(env):  # noqa: F811
    db, _ = env
    seed(db)
    db.tables["hr_invoices"].append(inv("d", "V-1", "Verifying Co", 50, status="verified", reference_no=5004))
    line = lambda h, iid: ReconcileLine(hash=h, date="2026-11-01", amount_paise=5000, invoice_id=iid)
    assert "only approved or paid" in rec.confirm(ReconcileConfirm(matches=[line("x", "d")]), USER)["outcomes"][0]["detail"]
    rec.confirm(ReconcileConfirm(matches=[ReconcileLine(hash="y", date="2026-11-01", amount_paise=1180000, invoice_id="a")]), USER)
    again = rec.confirm(ReconcileConfirm(matches=[ReconcileLine(hash="z", date="2026-11-02", amount_paise=1180000, invoice_id="a")]), USER)
    assert "already reconciled" in again["outcomes"][0]["detail"]


def test_preview_rejects_bad_statement(env):  # noqa: F811
    db, _ = env
    seed(db)
    with pytest.raises(HTTPException) as e:
        rec.preview(ReconcilePreview(csv_text="nope,nope\n1,2"), USER)
    assert e.value.status_code == 400
