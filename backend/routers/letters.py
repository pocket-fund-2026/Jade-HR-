import html
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

import email_service
from auth import require_permission
from database import maybe_single_data, supabase
from letter_email import HR_CONTACT, build_letter_email_html
from models import LetterEmailRequest, LetterGenerateRequest, LetterTemplateCreate, LetterTemplateUpdate

router = APIRouter(prefix="/api/letters", tags=["letters"])

TOKEN_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")
SLUG_RE = re.compile(r"[^a-z0-9]+")

DEFAULT_NEW_TEMPLATE_BODY = """\
<p class="lt-dateline"><span>Mumbai</span><span><strong>{{letter_date}}</strong></span></p>
<div class="lt-to"><span class="lt-label">To</span><strong>{{employee_name}}</strong><br>{{designation}}, {{department}}</div>
<p class="lt-subject">Subject of the letter</p>
<p>Dear {{employee_name}},</p>
<p>[Letter body goes here.]</p>
<div class="lt-sign"><p>Yours sincerely,<br>For <strong>{{company_name}}</strong></p><div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>{{signatory_name}}</strong></span><br><span class="lt-sign-meta">{{signatory_title}}</span></p></div>
"""


def _slugify(title: str) -> str:
    return SLUG_RE.sub("_", title.strip().lower()).strip("_") or "letter"


def _tokens_in(body: str) -> list[str]:
    """Unique {{token}} names in the order they first appear, so the
    generate form can be laid out in the same order as the letter reads."""
    seen: list[str] = []
    for match in TOKEN_RE.finditer(body):
        if match.group(1) not in seen:
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

    rendered = _substitute(template["body"], body.field_values)

    row = {
        "letter_type": body.letter_type,
        "employee_id": body.employee_id,
        "rendered_body": rendered,
        "field_values": body.field_values,
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
            **r,
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
