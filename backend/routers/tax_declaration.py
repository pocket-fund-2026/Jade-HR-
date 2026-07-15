from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import CONSOLE_ROLES, get_current_user, user_can
from database import maybe_single_data, supabase
from models import TaxDeclarationSave
from payroll import fy_label_for_month
from tds import DEFAULT_DECLARATION, project_annual_tax

router = APIRouter(prefix="/api", tags=["tax-declaration"])


def _get_declaration(employee_id: str, financial_year: str) -> dict:
    resp = (
        supabase.table("hr_tax_declarations")
        .select("*")
        .eq("employee_id", employee_id)
        .eq("financial_year", financial_year)
        .maybe_single()
        .execute()
    )
    return maybe_single_data(resp) or {**DEFAULT_DECLARATION, "employee_id": employee_id, "financial_year": financial_year}


def _current_financial_year() -> str:
    today = date.today()
    return fy_label_for_month(today.year, today.month)


@router.get("/me/tax-declaration")
def get_my_tax_declaration(financial_year: str | None = Query(None), user: dict = Depends(get_current_user)):
    return _get_declaration(user["id"], financial_year or _current_financial_year())


@router.put("/me/tax-declaration")
def save_my_tax_declaration(body: TaxDeclarationSave, user: dict = Depends(get_current_user)):
    row = body.model_dump()
    row["employee_id"] = user["id"]
    row["updated_at"] = datetime.now(timezone.utc).isoformat()
    supabase.table("hr_tax_declarations").upsert(row, on_conflict="employee_id,financial_year").execute()
    return _get_declaration(user["id"], body.financial_year)


@router.get("/me/tax-projection")
def my_tax_projection(financial_year: str | None = Query(None), user: dict = Depends(get_current_user)):
    financial_year = financial_year or _current_financial_year()
    declaration = _get_declaration(user["id"], financial_year)
    today = date.today()
    return project_annual_tax(user, financial_year, declaration, today.year, today.month)


@router.get("/employees/{employee_id}/tax-declaration")
def get_employee_tax_declaration(employee_id: str, financial_year: str | None = Query(None), user: dict = Depends(get_current_user)):
    """Admin view of another employee's declaration — gated the same way as
    salary figures (salary.view specifically, not salary.edit — see
    routers/employees.py's _sanitize), since regime/rent/80C are financial
    data of the same sensitivity."""
    if user["id"] != employee_id:
        if user["role"] not in CONSOLE_ROLES or not user_can(user, "salary.view"):
            raise HTTPException(status_code=403, detail="Not authorized")
    return _get_declaration(employee_id, financial_year or _current_financial_year())
