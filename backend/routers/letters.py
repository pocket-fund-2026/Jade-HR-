import html
import json
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

import email_service
from auth import require_permission
from database import maybe_single_data, supabase
from letter_email import HR_CONTACT, build_letter_email_html
from models import (
    LetterClauseIn,
    LetterEmailRequest,
    LetterGenerateRequest,
    LetterTemplateCreate,
    LetterTemplateUpdate,
)

router = APIRouter(prefix="/api/letters", tags=["letters"])

TOKEN_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")
CLAUSES_TOKEN_RE = re.compile(r"\{\{\s*clauses\s*\}\}")
SLUG_RE = re.compile(r"[^a-z0-9]+")

DEFAULT_NEW_TEMPLATE_BODY = """\
<p class="lt-dateline"><span>Mumbai</span><span><strong>{{letter_date}}</strong></span></p>
<div class="lt-to"><span class="lt-label">To</span><strong>{{employee_name}}</strong><br>{{designation}}, {{department}}</div>
<p class="lt-subject">Subject of the letter</p>
<p>Dear {{employee_name}},</p>
<p>[Letter body goes here.]</p>
<div class="lt-sign"><p>Yours sincerely,<br>For <strong>{{company_name}}</strong></p><div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>{{signatory_name}}</strong></span><br><span class="lt-sign-meta">{{signatory_title}}</span></p></div>
"""


CLAUSES_TOKEN = "clauses"
SIGN_BLOCK_MARKER = '<div class="lt-sign"'
MAX_CLAUSES = 30


def render_clauses(clauses: list[dict]) -> str:
    """Per-person clauses as one numbered 'Additional Terms' block. Titles and
    bodies are plain text from HR, so they are escaped; blank clauses drop out."""
    items = []
    for c in clauses or []:
        title = html.escape((c.get("title") or "").strip())
        body = html.escape((c.get("body") or "").strip()).replace("\n", "<br>")
        if not body and not title:
            continue
        lead = f"<strong>{title}.</strong> " if title and body else (f"<strong>{title}</strong>" if title else "")
        items.append(f"<li>{lead}{body}</li>")
    if not items:
        return ""
    return '<div class="lt-clauses"><p class="lt-clauses-h">Additional Terms</p><ol>' + "".join(items) + "</ol></div>"


def place_clauses(body: str, clauses_html: str) -> str:
    """Put the clauses where the template says ({{clauses}}); templates without
    that token (all the stock ones) get them just above the signature block."""
    if CLAUSES_TOKEN_RE.search(body):
        return CLAUSES_TOKEN_RE.sub(lambda _m: clauses_html, body)
    if not clauses_html:
        return body
    idx = body.find(SIGN_BLOCK_MARKER)
    if idx == -1:
        return body + clauses_html
    return body[:idx] + clauses_html + body[idx:]


def _clean_clauses(clauses: list[LetterClauseIn]) -> list[dict]:
    out = [{"title": c.title.strip(), "body": c.body.strip()} for c in clauses if c.title.strip() or c.body.strip()]
    if len(out) > MAX_CLAUSES:
        raise HTTPException(status_code=400, detail=f"At most {MAX_CLAUSES} clauses per letter")
    return out


def _slugify(title: str) -> str:
    return SLUG_RE.sub("_", title.strip().lower()).strip("_") or "letter"


def _tokens_in(body: str) -> list[str]:
    """Unique {{token}} names in the order they first appear, so the
    generate form can be laid out in the same order as the letter reads."""
    seen: list[str] = []
    for match in TOKEN_RE.finditer(body):
        # "clauses" is filled from the clause picker, not a typed form field.
        if match.group(1) not in seen and match.group(1) != CLAUSES_TOKEN:
            seen.append(match.group(1))
    return seen


# Form fields HR types one item per line; each line is escaped and wrapped
# into list/paragraph markup here (mirrors MULTILINE_TOKENS in Letters.jsx,
# which does the same for the live preview). Previously the browser sent
# these pre-wrapped and _substitute escaped the markup, so the SAVED copy of
# every offer/termination/warning letter showed literal "<ol><li>" text.
MULTILINE_TOKENS = {"kras": "numbered", "termination_reasons": "bullets", "warning_body": "paragraphs"}


def _wrap_multiline(text: str, mode: str) -> str:
    lines = [html.escape(line.strip()) for line in (text or "").split("\n") if line.strip()]
    if not lines:
        return ""
    if mode == "numbered":
        return "<ol>" + "".join(f"<li>{line}</li>" for line in lines) + "</ol>"
    if mode == "bullets":
        return "<ul>" + "".join(f"<li>{line}</li>" for line in lines) + "</ul>"
    return "".join(f"<p>{line}</p>" for line in lines)


def _substitute(body: str, field_values: dict[str, str], trusted_html_keys: frozenset[str] = frozenset()) -> str:
    # field_values come from the generate form (any letters.generate user) and are
    # spliced into template HTML that's later rendered with dangerouslySetInnerHTML,
    # so they must be escaped — the template body itself is trusted (letters.manage only).
    # trusted_html_keys is for server-built values only (e.g. late_policy's month list).
    def value(m: re.Match) -> str:
        key = m.group(1)
        raw = field_values.get(key, "") or ""
        if key in trusted_html_keys:
            return raw
        if key in MULTILINE_TOKENS:
            return _wrap_multiline(raw, MULTILINE_TOKENS[key])
        return html.escape(raw)

    return TOKEN_RE.sub(value, body)


@router.get("/templates")
def list_templates(user: dict = Depends(require_permission("letters.generate", "letters.manage"))):
    resp = supabase.table("hr_letter_templates").select("*").order("letter_type").execute()
    return [{**row, "tokens": _tokens_in(row["body"])} for row in resp.data]


@router.get("/templates/{letter_type}")
def get_template(letter_type: str, user: dict = Depends(require_permission("letters.generate", "letters.manage"))):
    resp = supabase.table("hr_letter_templates").select("*").eq("letter_type", letter_type).maybe_single().execute()
    data = maybe_single_data(resp)
    if not data:
        raise HTTPException(status_code=404, detail="Unknown letter type")
    return {**data, "tokens": _tokens_in(data["body"])}


@router.post("/templates")
def create_template(body: LetterTemplateCreate, user: dict = Depends(require_permission("letters.manage"))):
    letter_type = body.letter_type.strip() if body.letter_type else _slugify(body.title)
    letter_type = _slugify(letter_type)  # normalize even an explicitly-given key
    row = {
        "letter_type": letter_type,
        "title": body.title,
        "body": body.body.strip() or DEFAULT_NEW_TEMPLATE_BODY,
        "updated_by": user["id"],
    }
    existing = supabase.table("hr_letter_templates").select("letter_type").eq("letter_type", letter_type).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail=f"A template with key '{letter_type}' already exists")
    inserted = supabase.table("hr_letter_templates").insert(row).execute()
    return {**inserted.data[0], "tokens": _tokens_in(inserted.data[0]["body"])}


@router.put("/templates/{letter_type}")
def update_template(
    letter_type: str, body: LetterTemplateUpdate, user: dict = Depends(require_permission("letters.manage"))
):
    resp = (
        supabase.table("hr_letter_templates")
        .update({
            "title": body.title,
            "body": body.body,
            "updated_by": user["id"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })
        .eq("letter_type", letter_type)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Unknown letter type")
    return {**resp.data[0], "tokens": _tokens_in(resp.data[0]["body"])}


@router.delete("/templates/{letter_type}")
def delete_template(letter_type: str, user: dict = Depends(require_permission("letters.manage"))):
    resp = supabase.table("hr_letter_templates").delete().eq("letter_type", letter_type).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Unknown letter type")
    return {"ok": True}


# ── Clause library ──────────────────────────────────────────────────────────
# Reusable clauses HR can attach to a letter per person. letter_type NULL = offered
# on every letter. Stored in hr_letter_clauses (sql/079); if that table has not
# been applied yet the library is simply empty and one-off clauses still work.


CONDITION_OPS = {"eq", "neq", "in", "contains", "gt", "gte", "lt", "lte"}


def _num(text):
    try:
        return float(str(text).replace(",", "").strip())
    except ValueError:
        return None


def condition_matches(cond: dict, values: dict) -> bool:
    """One rule against the letter's form values. Text is compared trimmed and
    case-insensitive; gt/gte/lt/lte compare numbers (commas ignored). A blank
    or missing field never matches, so nothing is attached by accident."""
    actual = str(values.get(cond.get("field", ""), "") or "").strip()
    if not actual:
        return False
    op, want = cond.get("op"), str(cond.get("value", "") or "").strip()
    a, w = actual.lower(), want.lower()
    if op == "eq":
        return a == w
    if op == "neq":
        return a != w
    if op == "in":
        return a in {x.strip().lower() for x in want.split(",") if x.strip()}
    if op == "contains":
        return w in a
    if op in ("gt", "gte", "lt", "lte"):
        x, y = _num(actual), _num(want)
        if x is None or y is None:
            return False
        return {"gt": x > y, "gte": x >= y, "lt": x < y, "lte": x <= y}[op]
    return False


def clause_applies(conditions: list[dict] | None, values: dict) -> bool:
    """True when the clause has rules and every one matches. No rules = not conditional."""
    return bool(conditions) and all(condition_matches(c, values) for c in conditions)


def _clean_conditions(conditions) -> list[dict]:
    out = []
    for c in conditions or []:
        field, op = c.field.strip(), c.op.strip()
        if not field:
            continue
        if op not in CONDITION_OPS:
            raise HTTPException(status_code=400, detail=f"Unknown condition '{op}'")
        out.append({"field": field, "op": op, "value": c.value.strip()})
    return out


def _clause_table():
    return supabase.table("hr_letter_clauses")


@router.get("/clauses")
def list_clauses(
    letter_type: str | None = Query(default=None),
    user: dict = Depends(require_permission("letters.generate", "letters.manage")),
):
    try:
        rows = _clause_table().select("*").eq("is_active", True).order("sort_order").order("title").execute().data or []
    except Exception:
        return []
    if letter_type:
        rows = [r for r in rows if r.get("letter_type") in (None, letter_type)]
    return rows


@router.post("/clauses")
def create_clause(body: LetterClauseIn, user: dict = Depends(require_permission("letters.manage"))):
    if not body.title.strip() or not body.body.strip():
        raise HTTPException(status_code=400, detail="A clause needs a title and text")
    row = {
        "letter_type": body.letter_type or None,
        "title": body.title.strip(),
        "body": body.body.strip(),
        "default_on": body.default_on,
        "sort_order": body.sort_order,
        "updated_by": user["id"],
    }
    # Only sent when used, so plain clauses keep saving before sql/083 is applied.
    if body.conditions:
        row["conditions"] = _clean_conditions(body.conditions)
    try:
        return _clause_table().insert(row).execute().data[0]
    except Exception:
        raise HTTPException(status_code=503, detail="The clause library is not set up yet (run sql/079_letter_clauses.sql)")


@router.put("/clauses/{clause_id}")
def update_clause(clause_id: str, body: LetterClauseIn, user: dict = Depends(require_permission("letters.manage"))):
    fields = {
            "letter_type": body.letter_type or None,
            "title": body.title.strip(),
            "body": body.body.strip(),
            "default_on": body.default_on,
            "sort_order": body.sort_order,
            "updated_by": user["id"],
            "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    conditions = _clean_conditions(body.conditions)
    try:
        resp = _clause_table().update({**fields, "conditions": conditions}).eq("id", clause_id).execute()
    except Exception:
        if conditions:
            raise HTTPException(status_code=503, detail="Conditions need sql/083_letter_clause_conditions.sql applied first")
        # sql/083 not applied yet and nothing to store: save the rest as before.
        resp = _clause_table().update(fields).eq("id", clause_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Clause not found")
    return resp.data[0]


@router.delete("/clauses/{clause_id}")
def delete_clause(clause_id: str, user: dict = Depends(require_permission("letters.manage"))):
    # Soft delete: issued letters keep their own copy of the text either way.
    resp = _clause_table().update({"is_active": False}).eq("id", clause_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Clause not found")
    return {"ok": True}


@router.post("/generate")
def generate_letter(body: LetterGenerateRequest, user: dict = Depends(require_permission("letters.generate"))):
    resp = (
        supabase.table("hr_letter_templates")
        .select("body,title")
        .eq("letter_type", body.letter_type)
        .maybe_single()
        .execute()
    )
    template = maybe_single_data(resp)
    if not template:
        raise HTTPException(status_code=404, detail="Unknown letter type")

    clauses = _clean_clauses(body.clauses)
    rendered = _substitute(place_clauses(template["body"], render_clauses(clauses)), body.field_values)

    field_values = dict(body.field_values)
    if clauses:
        # Kept with the letter (no schema change) so an issued letter shows
        # exactly which clauses were attached for this person.
        field_values["_clauses"] = json.dumps(clauses)
    row = {
        "letter_type": body.letter_type,
        "employee_id": body.employee_id,
        "rendered_body": rendered,
        "field_values": field_values,
        "generated_by": user["id"],
        "title": template.get("title"),
    }
    inserted = supabase.table("hr_generated_letters").insert(row).execute()
    return inserted.data[0]


def _with_people(rows: list[dict]) -> list[dict]:
    """Attach employee + generated-by names, template title and the latest
    email attempt to history rows (two FKs to hr_employees make an embedded
    select ambiguous, so this is two plain lookups instead)."""
    ids = {r["employee_id"] for r in rows if r.get("employee_id")} | {r["generated_by"] for r in rows if r.get("generated_by")}
    people = {}
    if ids:
        resp = (
            supabase.table("hr_employees").select("id,first_name,last_name,employee_code,email").in_("id", list(ids)).execute()
        )
        people = {p["id"]: p for p in resp.data or []}
    titles = {t["letter_type"]: t["title"] for t in supabase.table("hr_letter_templates").select("letter_type,title").execute().data or []}
    out = []
    for r in rows:
        emp = people.get(r.get("employee_id")) or {}
        gen = people.get(r.get("generated_by")) or {}
        fv = r.get("field_values") or {}
        out.append({
            **{k: v for k, v in r.items() if k not in ("approver_token", "candidate_token")},
            "title": r.get("title") or titles.get(r["letter_type"], r["letter_type"]),
            "employee_name": f"{emp.get('first_name', '')} {emp.get('last_name') or ''}".strip() or fv.get("employee_name", ""),
            "employee_code": emp.get("employee_code") or fv.get("employee_code", ""),
            "employee_email": emp.get("email") or fv.get("email", ""),
            "generated_by_name": f"{gen.get('first_name', '')} {gen.get('last_name') or ''}".strip(),
        })
    return out


@router.get("/history")
def letter_history(
    employee_id: str | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    user: dict = Depends(require_permission("letters.generate", "letters.manage")),
):
    query = supabase.table("hr_generated_letters").select("*").order("created_at", desc=True).limit(limit)
    if employee_id:
        query = query.eq("employee_id", employee_id)
    return _with_people(query.execute().data or [])


@router.get("/history/{letter_id}")
def get_generated_letter(letter_id: str, user: dict = Depends(require_permission("letters.generate", "letters.manage"))):
    row = maybe_single_data(supabase.table("hr_generated_letters").select("*").eq("id", letter_id).maybe_single().execute())
    if not row:
        raise HTTPException(status_code=404, detail="Letter not found")
    return _with_people([row])[0]


MAX_PDF_B64 = 3_500_000  # Vercel caps a request body at 4.5 MB


@router.post("/history/{letter_id}/email")
def email_letter(letter_id: str, body: LetterEmailRequest, user: dict = Depends(require_permission("letters.generate"))):
    """Email a generated letter to the employee (or a candidate, for offers)
    as Tina at JADE HR: HR's cover note, the letter inline on its
    letterhead, and the previewed PDF attached when the browser supplied one.
    Replies go to the HR team inbox, not the no-reply sender."""
    row = maybe_single_data(supabase.table("hr_generated_letters").select("*").eq("id", letter_id).maybe_single().execute())
    if not row:
        raise HTTPException(status_code=404, detail="Letter not found")
    to = body.to.strip().lower()
    if "@" not in to:
        raise HTTPException(status_code=400, detail="Enter a valid recipient email address")
    cc = [c.strip().lower() for c in body.cc if c and "@" in c]
    if body.pdf_base64 and len(body.pdf_base64) > MAX_PDF_B64:
        raise HTTPException(status_code=413, detail="The PDF is too large to attach — send without it")

    title = _with_people([row])[0]["title"]
    subject = body.subject.strip() or title
    message = body.message.strip()
    html_doc = build_letter_email_html(row["rendered_body"], message, title)
    text = (message + "\n\n" if message else "") + (
        f"Your {title} from JADE Lifestyles India is included in this email"
        + (" and attached as a PDF." if body.pdf_base64 else ".")
        + f"\n\nFor any questions, reply to this email or write to {HR_CONTACT}.\n"
    )
    attachments = None
    if body.pdf_base64:
        filename = (body.pdf_filename or f"{_slugify(title)}.pdf").strip()
        if not filename.lower().endswith(".pdf"):
            filename += ".pdf"
        attachments = [{"filename": filename, "content": body.pdf_base64}]

    ok, err = email_service.send_email_detailed(
        to, subject, text, kind="letter", html=html_doc, cc=cc, reply_to=HR_CONTACT,
        letter_id=letter_id, attachments=attachments,
    )
    if not ok:
        raise HTTPException(status_code=502, detail=f"Email could not be sent: {err}")
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("hr_generated_letters").update({"emailed_to": to, "emailed_at": now}).eq("id", letter_id).execute()
    return {"ok": True, "emailed_to": to, "emailed_at": now}
