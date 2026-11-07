from invoice_check import extract_fields, verify

DOC = "ACME Textiles Pvt Ltd\nInvoice No: INV/2026/0042\nSubtotal 10,000.00\nGST 1,800.00\nGrand Total Rs. 11,800.00"


def test_extracts_company_number_and_total():
    assert extract_fields(DOC) == {"company_name": "ACME Textiles Pvt Ltd", "invoice_number": "INV/2026/0042", "amount": 11800.0}
    assert extract_fields("") == {}


def test_matching_invoice_passes():
    assert verify("INV/2026/0042", 11800, DOC)["result"] == "passed"
    assert verify("inv 2026 0042", 11800.0, DOC)["result"] == "passed"  # punctuation/case don't matter


def test_number_or_amount_mismatch_is_rejected_with_reason():
    out = verify("INV/2026/0099", 11800, DOC)
    assert out["result"] == "rejected"
    assert any("not found" in c["detail"] for c in out["checks"] if not c["ok"])
    assert verify("INV/2026/0042", 9999, DOC)["result"] == "rejected"


def test_bad_format_and_duplicate_rejected():
    assert verify("!!!", 100, DOC)["result"] == "rejected"
    assert verify("INV/2026/0042", 0, DOC)["result"] == "rejected"
    assert verify("INV/2026/0042", 11800, DOC, duplicate=True)["result"] == "rejected"


def test_unreadable_document_goes_to_manual_not_rejected():
    assert verify("A-1", 500, "")["result"] == "manual"


def test_routes_registered_and_gated():
    from fastapi.testclient import TestClient

    import main

    paths = {r.path for r in main.app.routes}
    assert {"/api/invoices/submit", "/api/invoices/track", "/api/invoices/{invoice_id}/approve"} <= paths
    client = TestClient(main.app)
    assert client.get("/api/invoices").status_code in (401, 403)
    assert client.post("/api/invoices/abc/approve", json={}).status_code in (401, 403)
