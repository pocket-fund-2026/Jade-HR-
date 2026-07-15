from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import require_permission
from database import maybe_single_data, supabase
from models import LumpsumSave, SalaryStructureSave
from payroll import pay_period_bounds
from statutory import ZERO_ESIC, ZERO_PF, compute_esic, compute_pf, compute_pt, location_to_state

router = APIRouter(prefix="/api/employees", tags=["salary-structure"])

# The Lumpsum Report's editable columns — a subset of hr_salary_structure's
# own fields (see LumpsumSave). TDS is deliberately excluded: computed from
# the Tax Declaration every time payroll is viewed, so a manual edit here
# would just be silently overwritten next period.
LUMPSUM_FIELDS = (
    "earn_arrear", "earn_bonus", "earn_leave_encash", "earn_performance_linked_pay",
    "ded_loan_int", "ded_other_ded", "ded_salary_advance", "ded_pf_arrear",
)

# Recurring cash earnings that count toward the ESIC coverage-ceiling check
# and contribution base — excludes OT/arrears/CTC-and-TotalArr roll-ups.
ESIC_WAGE_KEYS = (
    "earn_basic", "earn_hra", "earn_conv", "earn_other_allow", "earn_bonus",
    "earn_leave_encash", "earn_monthly_bonus", "earn_performance_linked_pay",
    "earn_retention", "earn_incentive",
)


def _get_employee(employee_id: str) -> dict:
    resp = (
        supabase.table("hr_employees")
        .select("id,date_of_joining,location")
        .eq("id", employee_id)
        .maybe_single()
        .execute()
    )
    data = maybe_single_data(resp)
    if not data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return data


def _get_compliance_profile(employee_id: str) -> dict:
    resp = (
        supabase.table("hr_employee_profile")
        .select("pf_applicable,eps_applicable,pf_gross_limit,esic_applicable,pt_applicable,gender")
        .eq("employee_id", employee_id)
        .maybe_single()
        .execute()
    )
    return maybe_single_data(resp) or {}


def _apply_statutory(row: dict, profile: dict, state: str | None, month: int) -> dict:
    """PF/ESIC/PT are auto-calculated from the employee's Compliances flags
    and can't be hand-edited — a non-applicable employee is forced to 0 so a
    stale manual entry can never survive an unrelated save. LWF is left as a
    manual entry here (unlike in the actual monthly payslip) since it's
    deducted half-yearly, not every pay cycle, and this structure isn't tied
    to a specific pay period the way a payslip is."""
    updates = {}
    if profile.get("pf_applicable"):
        pf_gross_limit = float(profile.get("pf_gross_limit") or 0)
        updates.update(compute_pf(row["earn_basic"], pf_gross_limit, bool(profile.get("eps_applicable"))))
    else:
        updates.update(ZERO_PF)

    gross_wages = sum(row[k] for k in ESIC_WAGE_KEYS)
    if profile.get("esic_applicable"):
        updates.update(compute_esic(gross_wages))
    else:
        updates.update(ZERO_ESIC)

    if profile.get("pt_applicable"):
        updates["ded_pt"] = compute_pt(gross_wages, state, profile.get("gender"), month)
        updates["oth_pt_wages"] = round(gross_wages, 2)
    else:
        updates["ded_pt"] = 0.0
        updates["oth_pt_wages"] = 0.0
    return updates


def _compute_summary(row: dict) -> dict:
    """Only the unambiguous sums — Total Earnings/Deductions, Net Salary, and
    the standard CTC = gross + employer-side statutory contributions
    (EPS/EPF/EDLI/PF admin/ESIC employer). earn_ctc and earn_total_arr are
    left as manual line items, not folded into the sum, since they read as
    roll-ups themselves rather than primitive earning components."""
    total_earnings = round(sum(row[k] for k in ESIC_WAGE_KEYS) + row["earn_ot_amt"] + row["earn_arrear"], 2)
    total_deductions = round(
        row["ded_pf"] + row["ded_pt"] + row["ded_vpf"] + row["ded_esic"] + row["ded_tds"]
        + row["ded_loan"] + row["ded_advance"] + row["ded_loan_int"] + row["ded_lwf"]
        + row["ded_other_ded"] + row["ded_salary_advance"] + row["ded_pf_arrear"],
        2,
    )
    employer_side = (
        row["oth_eps"] + row["oth_epf"] + row["oth_edli_charges"] + row["oth_pf_admin_charges"]
        + row["oth_edli_admin_charges"] + row["oth_esic_employer"]
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
    state = location_to_state(employee.get("location"))
    row.update(_apply_statutory(row, _get_compliance_profile(employee_id), state, body.effective_date.month))
    row.update(_compute_summary(row))

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
    state = location_to_state(employee.get("location"))
    updates.update(_apply_statutory(updates, _get_compliance_profile(employee_id), state, body.effective_date.month))
    updates.update(_compute_summary(updates))

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


@router.put("/{employee_id}/lumpsum")
def save_lumpsum(
    employee_id: str, body: LumpsumSave, user: dict = Depends(require_permission("salary.edit")),
):
    """Saves the Lumpsum Report's 8 editable one-off figures for one pay
    period, without disturbing the employee's actual Basic/HRA/etc or
    statutory setup. Updates the hr_salary_structure row already dated
    within this pay period if one exists; otherwise carries forward every
    other figure from the latest structure as of this period's end onto a
    new row dated at the period end, so a Lumpsum-only edit never has to
    know or touch the employee's regular pay figures."""
    employee = _get_employee(employee_id)
    start, end = pay_period_bounds(body.period_year, body.period_month)

    in_period = (
        supabase.table("hr_salary_structure")
        .select("*")
        .eq("employee_id", employee_id)
        .gte("effective_date", start.isoformat())
        .lte("effective_date", end.isoformat())
        .order("effective_date", desc=True)
        .limit(1)
        .execute()
        .data
    )
    structure_id = None
    if in_period:
        base = in_period[0]
        structure_id = base["id"]
    else:
        latest = (
            supabase.table("hr_salary_structure")
            .select("*")
            .eq("employee_id", employee_id)
            .lte("effective_date", end.isoformat())
            .order("effective_date", desc=True)
            .limit(1)
            .execute()
            .data
        )
        if not latest:
            raise HTTPException(
                status_code=400,
                detail="No Salary Structure exists yet for this employee — add one from Employee Details first",
            )
        base = dict(latest[0])
        base["effective_date"] = end.isoformat()

    row = {**base}
    for field in LUMPSUM_FIELDS:
        row[field] = getattr(body, field)
    row.pop("id", None)
    row.pop("created_at", None)
    row.pop("updated_at", None)

    state = location_to_state(employee.get("location"))
    row.update(_apply_statutory(row, _get_compliance_profile(employee_id), state, body.period_month))
    row.update(_compute_summary(row))
    row["updated_at"] = datetime.now(timezone.utc).isoformat()

    if structure_id:
        resp = supabase.table("hr_salary_structure").update(row).eq("id", structure_id).execute()
    else:
        row["employee_id"] = employee_id
        row["created_by"] = user["id"]
        resp = supabase.table("hr_salary_structure").insert(row).execute()

    return resp.data[0]
