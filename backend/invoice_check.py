"""Reads an invoice attachment and checks it against what the vendor typed.

Pure functions (no DB) so the rules are easy to test. PDF text comes from
pypdf when it's installed; images and scanned PDFs have no text layer, so
they come back as "manual" for a person to check instead of being rejected.
"""
import io
import re

AMOUNT_RE = re.compile(r"(?<![\d.,])(\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d])")
INVOICE_NO_RE = re.compile(r"invoice\s*(?:no\.?|number|num|#)\s*[:.\-#]*\s*([A-Za-z0-9][A-Za-z0-9/\-_.]{1,29})", re.I)
TOTAL_RE = re.compile(r"(?<![a-z])(?:grand\s*total|total\s*amount|amount\s*due|net\s*payable|total)\s*(?:\(.*?\))?\s*[:\-]?\s*(?:rs\.?|inr|₹)?\s*([\d,]+(?:\.\d{1,2})?)", re.I)

MAX_PDF_PAGES = 15


def extract_text(data: bytes, content_type: str) -> str:
    """Text layer of a PDF; "" for images/scans or if pypdf is unavailable."""
    if "pdf" not in (content_type or "").lower():
        return ""
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages[:MAX_PDF_PAGES]).strip()
    except Exception:
        return ""


def _alnum(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (value or "").lower())


def _amounts(text: str) -> list[float]:
    out = []
    for m in AMOUNT_RE.finditer(text or ""):
        try:
            out.append(float(m.group(1).replace(",", "")))
        except ValueError:
            pass
    return out


def extract_fields(text: str) -> dict:
    """Best-effort read of the key fields, kept for filtering and analysis."""
    if not text:
        return {}
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    inv = INVOICE_NO_RE.search(text)
    totals = [float(t.replace(",", "")) for t in TOTAL_RE.findall(text) if t.replace(",", "").replace(".", "").isdigit()]
    return {
        "company_name": lines[0][:120] if lines else "",
        "invoice_number": inv.group(1).rstrip(".") if inv else "",
        "amount": max(totals) if totals else None,
    }


def verify(invoice_number: str, amount: float, text: str, has_attachment: bool = True, duplicate: bool = False) -> dict:
    """-> {"result": "passed"|"rejected"|"manual", "checks": [{check, ok, detail}]}.

    rejected = something we can positively see is wrong (duplicate, bad
    format, or the readable document disagrees with the form); manual = the
    document can't be read so a person has to look; passed = it all lines up.
    """
    checks = []

    def add(name: str, ok: bool, detail: str):
        checks.append({"check": name, "ok": ok, "detail": detail})

    add("Attachment present", has_attachment, "PDF/image attached" if has_attachment else "No attachment")
    add("Invoice number format", bool(_alnum(invoice_number)), "Looks valid" if _alnum(invoice_number) else "Invoice number is blank or has no letters/digits")
    add("Amount format", amount is not None and amount > 0, f"{amount:,.2f}" if amount and amount > 0 else "Amount must be greater than zero")
    if duplicate:
        add("Not a duplicate", False, "This vendor already submitted this invoice number")

    readable = bool(text.strip())
    if readable:
        no_ok = bool(_alnum(invoice_number)) and _alnum(invoice_number) in _alnum(text)
        add("Invoice number matches document", no_ok, "Found on the invoice" if no_ok else f"'{invoice_number}' not found in the document text")
        # A labelled total, when the document has one, is the number that counts —
        # otherwise any figure on the page (a date, a phone number) could "match".
        totals = [float(t.replace(",", "")) for t in TOTAL_RE.findall(text) if t.replace(",", "").replace(".", "").isdigit()]
        candidates = totals or _amounts(text)
        amt_ok = amount is not None and any(abs(a - amount) < 0.01 for a in candidates)
        add("Amount matches document", amt_ok, "Found on the invoice" if amt_ok else f"{amount:,.2f} not found in the document text")

    failed = [c for c in checks if not c["ok"]]
    if failed:
        return {"result": "rejected", "checks": checks}
    if not readable:
        checks.append({"check": "Document readable", "ok": False, "detail": "No text could be read (image or scanned PDF) — needs a manual check"})
        return {"result": "manual", "checks": checks}
    return {"result": "passed", "checks": checks}
