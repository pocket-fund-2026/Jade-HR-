from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import require_permission
from database import maybe_single_data, supabase
from models import SalaryStructureSave

router = APIRouter(prefix="/api/employees", tags=["salary-structure"])


def _get_employee(employee_id: str) -> dict:
    resp = supabase.table("hr_employees").select("id,date_of_joining").eq("id", employee_id).maybe_single().execute()
    data = maybe_single_data(resp)
    if not data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return data


def _compute_summary(body: SalaryStructureSave) -> dict:
    """Only the unambiguous sums — Total Earnings/Deductions, Net Salary, and
    the standard CTC = gross + employer-side statutory contributions
    (EPS/EPF/EDLI/PF admin/ESIC employer). earn_ctc and earn_total_arr are
    left as manual line items, not folded into the sum, since they read as
    roll-ups themselves rather than primitive earning components."""
    total_earnings = round(
        body.earn_basic + body.earn_hra + body.earn_conv + body.earn_other_allow
        + body.earn_ot_amt + body.earn_arrear + body.earn_bonus + body.earn_leave_encash
        + body.earn_monthly_bonus + body.earn_performance_linked_pay + body.earn_retention
        + body.earn_incentive,
        2,
    )
    total_deductions = round(
        body.ded_pf + body.ded_pt + body.ded_vpf + body.ded_esic + body.ded_tds
        + body.ded_loan + body.ded_advance + body.ded_loan_int + body.ded_lwf
        + body.ded_other_ded + body.ded_salary_advance + body.ded_pf_arrear,
        2,
    )
    employer_side = (
        body.oth_eps + body.oth_epf + body.oth_edli_charges + body.oth_pf_admin_charges
        + body.oth_edli_admin_charges + body.oth_esic_employer
    )
    ctc_monthly = round(total_earnings + employer_side, 2)
    return {
        "total_earnings": total_earnings,
        "total_deductions": total_deductions,
        "net_salary": round(total_earnings - total_deductions, 2),
        "ctc_monthly": ctc_monthly,
        "ctc_yearly": round(ctc_monthly * 12, 2),
    }


def _validate_effective_date(employee: dict, effective_date: date) -> None:
    doj = employee.get("date_of_joining")
    if doj and effective_date < date.fromisoformat(doj):
        raise HTTPException(status_code=400, detail="Effective date must be on or after the Date of Joining")


@router.get("/{employee_id}/salary-structures")
def list_salary_structures(employee_id: str, user: dict = Depends(require_permission("salary.view"))):
    _get_employee(employee_id)
    resp = (
        supabase.table("hr_salary_structure")
        .select("*")
        .eq("employee_id", employee_id)
        .order("effective_date", desc=True)
        .execute()
    )
    return resp.data


@router.get("/{employee_id}/salary-structures/{structure_id}")
def get_salary_structure(employee_id: str, structure_id: str, user: dict = Depends(require_permission("salary.view"))):
    resp = (
        supabase.table("hr_salary_structure")
        .select("*")
        .eq("id", structure_id)
        .eq("employee_id", employee_id)
        .maybe_single()
        .execute()
    )
    data = maybe_single_data(resp)
    if not data:
        raise HTTPException(status_code=404, detail="Salary structure not found")
    return data


@router.post("/{employee_id}/salary-structures")
def create_salary_structure(
    employee_id: str, body: SalaryStructureSave, user: dict = Depends(require_permission("salary.edit"))
):
    employee = _get_employee(employee_id)
    _validate_effective_date(employee, body.effective_date)

    existing = (
        supabase.table("hr_salary_structure")
        .select("id")
        .eq("employee_id", employee_id)
        .eq("effective_date", body.effective_date.isoformat())
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="A salary structure already exists for this effective date")

    row = body.model_dump()
    row["effective_date"] = row["effective_date"].isoformat()
    row["employee_id"] = employee_id
    row["created_by"] = user["id"]
    row.update(_compute_summary(body))

    inserted = supabase.table("hr_salary_structure").insert(row).execute()

    supabase.table("hr_employees").update({
        "basic": body.me_basic, "hra": body.me_hra,
        "conveyance": body.me_conv, "other_allowance": body.me_other_allow,
    }).eq("id", employee_id).execute()

    return inserted.data[0]


@router.put("/{employee_id}/salary-structures/{structure_id}")
def update_salary_structure(
    employee_id: str, structure_id: str, body: SalaryStructureSave,
    user: dict = Depends(require_permission("salary.edit")),
):
    employee = _get_employee(employee_id)
    _validate_effective_date(employee, body.effective_date)

    updates = body.model_dump()
    updates["effective_date"] = updates["effective_date"].isoformat()
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    updates.update(_compute_summary(body))

    resp = (
        supabase.table("hr_salary_structure")
        .update(updates)
        .eq("id", structure_id)
        .eq("employee_id", employee_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Salary structure not found")

    supabase.table("hr_employees").update({
        "basic": body.me_basic, "hra": body.me_hra,
        "conveyance": body.me_conv, "other_allowance": body.me_other_allow,
    }).eq("id", employee_id).execute()

    return resp.data[0]
