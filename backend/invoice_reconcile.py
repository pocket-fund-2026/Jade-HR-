"""Bank statement <-> invoice reconciliation (pure functions, no DB).

parse_statement() turns a bank CSV into outgoing payment lines (credits are
ignored), and match_lines() proposes which open invoice each payment settles.
A payment is only ever *proposed* here; a person confirms before anything is
marked paid.
"""
import csv
import hashlib
import io
import re
from datetime import date, datetime

DATE_FORMATS = ("%d/%m/%Y", "%d-%m-%Y", "%d/%m/%y", "%d-%m-%y", "%d-%b-%Y", "%d %b %Y", "%Y-%m-%d", "%d-%b-%y", "%d.%m.%Y")
DATE_HEADS = ("transaction date", "txn date", "value date", "post date", "posting date", "date")
DESC_HEADS = ("narration", "description", "particulars", "transaction remarks", "remarks", "details")
REF_HEADS = ("utr", "reference", "ref no", "chq", "cheque", "transaction id", "txn id", "instrument")
DEBIT_HEADS = ("withdrawal", "debit", "paid out", "dr amount")
AMOUNT_HEADS = ("amount",)
TYPE_HEADS = ("dr/cr", "cr/dr", "type", "txn type")
STOP_WORDS = {"pvt", "ltd", "private", "limited", "llp", "and", "the", "co", "company", "india", "traders", "enterprises", "industries", "textiles"}


def paise(value) -> int | None:
    """'1,23,456.50', '(500.00)', 'Rs. 99', '500 Dr' -> integer paise (absolute value)."""
    if value is None:
        return None
    s = str(value).strip().lower().replace("₹", "").replace("rs.", "").replace("rs", "").replace("inr", "")
    s = re.sub(r"\b(dr|cr)\b\.?", "", s).replace(",", "").replace("(", "").replace(")", "").strip()
    if not s or s in {"-", "--"}:
        return None
    try:
        return round(abs(float(s)) * 100)
    except ValueError:
        return None


def parse_date(value: str) -> date | None:
    v = (value or "").strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            pass
    return None


def _find(headers: list[str], wanted: tuple[str, ...]) -> int | None:
    low = [h.strip().lower() for h in headers]
    for w in wanted:  # earlier synonyms win
        for i, h in enumerate(low):
            if h == w or (len(w) > 3 and w in h):
                return i
    return None


def line_hash(line: dict) -> str:
    raw = f"{line['date']}|{line['amount_paise']}|{line['reference'].strip().lower()}|{line['description'].strip().lower()}"
    return hashlib.sha256(raw.encode()).hexdigest()[:32]


def parse_statement(text: str) -> dict:
    """-> {"lines": [outgoing payments], "skipped": n, "columns": {...}}. Raises ValueError with a plain message."""
    text = text.lstrip("﻿")
    try:
        dialect = csv.Sniffer().sniff(text[:4000], delimiters=",;\t|")
    except csv.Error:
        dialect = csv.excel
    rows = [r for r in csv.reader(io.StringIO(text), dialect) if any(c.strip() for c in r)]
    header_idx = None
    for i, r in enumerate(rows[:40]):  # banks put account details above the table
        if _find(r, DATE_HEADS) is not None and (_find(r, DEBIT_HEADS) is not None or _find(r, AMOUNT_HEADS) is not None):
            header_idx = i
            break
    if header_idx is None:
        raise ValueError("Could not find the statement table. It needs a Date column and a Debit/Withdrawal (or Amount) column.")
    head = rows[header_idx]
    c_date, c_desc, c_ref = _find(head, DATE_HEADS), _find(head, DESC_HEADS), _find(head, REF_HEADS)
    c_debit, c_amt, c_type = _find(head, DEBIT_HEADS), _find(head, AMOUNT_HEADS), _find(head, TYPE_HEADS)

    lines, skipped = [], 0
    for r in rows[header_idx + 1:]:
        def cell(i):
            return r[i].strip() if i is not None and i < len(r) else ""
        d = parse_date(cell(c_date))
        if d is None:
            skipped += 1
            continue
        if c_debit is not None:
            amt = paise(cell(c_debit))
        else:
            raw = cell(c_amt)
            kind = cell(c_type).lower()
            is_debit = raw.strip().startswith("-") or raw.strip().startswith("(") or "dr" in kind or bool(re.search(r"\bdr\b", raw.lower()))
            amt = paise(raw) if is_debit else None
        if not amt:
            skipped += 1  # a credit, a balance-only row, or a blank
            continue
        line = {"date": d.isoformat(), "description": cell(c_desc), "reference": cell(c_ref), "amount_paise": amt}
        line["hash"] = line_hash(line)
        lines.append(line)
    return {"lines": lines, "skipped": skipped, "columns": {"date": head[c_date], "description": head[c_desc] if c_desc is not None else None,
            "reference": head[c_ref] if c_ref is not None else None}}


def _alnum(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _vendor_tokens(name: str) -> list[str]:
    return [t for t in re.findall(r"[a-z0-9]+", (name or "").lower()) if len(t) >= 4 and t not in STOP_WORDS]


def score(line: dict, inv: dict) -> dict:
    """Why this payment might belong to this invoice."""
    hay = _alnum(f"{line['description']} {line['reference']}")
    number = _alnum(inv["invoice_number"])
    pay_ref = _alnum(inv.get("payment_ref") or "")
    toks = _vendor_tokens(inv["vendor_name"])
    amount = round(float(inv["amount"]) * 100)
    return {
        "number": len(number) >= 4 and number in hay,
        "ref": len(pay_ref) >= 4 and pay_ref in hay,
        "vendor": bool(toks) and any(t in hay for t in toks),
        "amount_exact": line["amount_paise"] == amount,
        "diff_paise": line["amount_paise"] - amount,
        "near": amount > 0 and abs(line["amount_paise"] - amount) <= max(100, amount // 100),  # within 1%
    }


def match_lines(lines: list[dict], invoices: list[dict], already_matched_hashes: set[str] = frozenset(), reconciled_invoice_ids: set[str] = frozenset()) -> list[dict]:
    """Propose a match for each payment line.

    status: matched | review | amount_mismatch | duplicate_payment | already_imported | unmatched
      matched           invoice number / payment ref found AND exact amount (safe to auto-tick)
      review            exact amount + vendor name, but no invoice number (a person should look)
      amount_mismatch   invoice number / ref found but the amount differs (short/over payment)
      duplicate_payment the invoice was already settled by an earlier payment
      already_imported  this exact bank line was reconciled before
    Each open invoice is proposed for at most one line (best score wins).
    """
    open_invoices = [i for i in invoices if i["status"] in ("approved", "paid")]
    results = []
    for line in lines:
        if line["hash"] in already_matched_hashes:
            results.append({**line, "status": "already_imported", "invoice_id": None, "diff_paise": 0, "why": "This bank line was already reconciled"})
            continue
        best = None
        for inv in open_invoices:
            s = score(line, inv)
            strong = s["number"] or s["ref"]
            if strong and s["amount_exact"]:
                rank, status = 4, "matched"
            elif strong:
                rank, status = 3, "amount_mismatch"
            elif s["amount_exact"] and s["vendor"]:
                rank, status = 2, "review"
            else:
                continue
            if inv["id"] in reconciled_invoice_ids:
                rank, status = 1, "duplicate_payment"
            if best is None or rank > best[0]:
                best = (rank, status, inv, s)
        if best is None:
            results.append({**line, "status": "unmatched", "invoice_id": None, "diff_paise": 0, "why": "No invoice matches this payment"})
            continue
        _, status, inv, s = best
        why = {"matched": "Invoice number/reference and amount match", "review": "Amount and vendor match, but no invoice number in the narration",
               "amount_mismatch": f"Invoice found but amount differs by {s['diff_paise'] / 100:+,.2f}",
               "duplicate_payment": "This invoice was already paid by another bank line"}[status]
        results.append({**line, "status": status, "invoice_id": inv["id"], "invoice_number": inv["invoice_number"], "vendor_name": inv["vendor_name"],
                        "diff_paise": s["diff_paise"], "why": why})

    # One invoice settles one payment: if two lines picked the same invoice, keep the best, demote the rest.
    rank = {"matched": 4, "amount_mismatch": 3, "review": 2, "duplicate_payment": 1}
    seen: dict[str, int] = {}
    for idx, r in enumerate(results):
        iid = r.get("invoice_id")
        if not iid or r["status"] == "duplicate_payment":
            continue
        if iid in seen:
            keep, drop = (seen[iid], idx) if rank[results[seen[iid]]["status"]] >= rank[r["status"]] else (idx, seen[iid])
            results[drop] = {**results[drop], "status": "duplicate_payment", "why": "A second payment for the same invoice in this statement"}
            seen[iid] = keep
        else:
            seen[iid] = idx
    return results
