import re
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import require_permission
from database import maybe_single_data, supabase
from models import LetterGenerateRequest, LetterTemplateCreate, LetterTemplateUpdate

router = APIRouter(prefix="/api/letters", tags=["letters"])

TOKEN_RE = re.compile(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}")
SLUG_RE = re.compile(r"[^a-z0-9]+")

DEFAULT_NEW_TEMPLATE_BODY = """\
<p>Date: {{letter_date}}</p>
<p>To,<br>
{{employee_name}}</p>
<p>Dear <strong>{{employee_name}}</strong>,</p>
<p>[Letter body goes here.]</p>
<p>Sincerely,</p>
<p><strong>{{signatory_name}}</strong><br>
{{signatory_title}}<br>
{{company_name}}</p>
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


def _substitute(body: str, field_values: dict[str, str]) -> str:
    return TOKEN_RE.sub(lambda m: field_values.get(m.group(1), ""), body)


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
        .select("body")
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
    }
    inserted = supabase.table("hr_generated_letters").insert(row).execute()
    return inserted.data[0]


@router.get("/history")
def letter_history(
    employee_id: str | None = Query(default=None),
    user: dict = Depends(require_permission("letters.generate", "letters.manage")),
):
    query = supabase.table("hr_generated_letters").select("*").order("created_at", desc=True)
    if employee_id:
        query = query.eq("employee_id", employee_id)
    return query.execute().data
