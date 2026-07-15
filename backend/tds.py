"""TDS (Sec 192) projection engine — pure, no DB access.

Design decision on "projected annual salary": rather than reconstructing
actual month-by-month attendance/OT/LOP across the financial year (which
would (a) risk overcounting pre-Date-of-Joining periods, since
compute_monthly_summary's gross_salary is a flat monthly figure that does
NOT zero out for a pre-DOJ pay period, and (b) add O(employees x months) DB
load to what should be a cheap, frequently-recomputed report), this module
projects annual gross salary as CURRENT recurring Basic+HRA+Conveyance+
OtherAllowance+MonthlyBonus+Retention+Incentive x the number of FY month
labels the employee is actually employed for (bounded by Date of Joining /
exit date). This mirrors how this codebase already annualizes CTC
(ctc_yearly = ctc_monthly x 12 in routers/salary_structure.py) rather than
reconstructing history, and future OT/LOP is inherently unpredictable
anyway. If actual pay swings materially (a raise, big OT month, etc.)
mid-year, the monthly TDS naturally self-corrects the next time this is
computed, since it's recomputed fresh for every payslip from current rates
— it is a rolling projection, not a one-time April calculation.

"Months remaining" (the TDS divisor) is FY month labels from the payslip's
own (year, month) through FY-end — i.e. the full projected annual tax is
collected across whatever months remain, catching up faster if the feature
is turned on mid-year. This is standard Sec 192 practice.
"""

from datetime import date

from payroll import applicable_fy_months, fy_month_labels, pay_period_bounds
from statutory import (
    HOME_LOAN_INTEREST_CAP,
    SECTION_80C_CAP,
    SECTION_80D_CAP,
    compute_hra_exemption,
    compute_income_tax,
    location_is_metro,
)

DEFAULT_DECLARATION = {
    "regime": "new",
    "rent_paid_annual": 0.0,
    "section_80c": 0.0,
    "section_80d": 0.0,
    "home_loan_interest": 0.0,
    "other_deductions": 0.0,
}


def _monthly_recurring_gross(employee: dict) -> float:
    return (
        float(employee.get("basic") or 0) + float(employee.get("hra") or 0)
        + float(employee.get("conveyance") or 0) + float(employee.get("other_allowance") or 0)
        + float(employee.get("monthly_bonus") or 0) + float(employee.get("retention") or 0)
        + float(employee.get("incentive") or 0)
    )


def remaining_fy_months(financial_year: str, from_year: int, from_month: int, employee: dict | None = None) -> list[tuple[int, int]]:
    labels = fy_month_labels(financial_year)
    idx = labels.index((from_year, from_month)) if (from_year, from_month) in labels else 0
    remaining = labels[idx:]
    if employee is not None:
        applicable = set(applicable_fy_months(employee, financial_year))
        remaining = [l for l in remaining if l in applicable]
    return remaining


def project_annual_tax(employee: dict, financial_year: str, declaration: dict, from_year: int, from_month: int) -> dict:
    months = applicable_fy_months(employee, financial_year)
    monthly_recurring = _monthly_recurring_gross(employee)
    projected_gross = round(monthly_recurring * len(months), 2)

    regime = declaration.get("regime") or "new"
    if regime == "old":
        annual_basic = float(employee.get("basic") or 0) * len(months)
        annual_hra = float(employee.get("hra") or 0) * len(months)
        hra_exemption = compute_hra_exemption(
            annual_hra, annual_basic, float(declaration.get("rent_paid_annual") or 0),
            location_is_metro(employee.get("location")),
        )
        standard_deduction = 50000.0
        section_80c = min(max(float(declaration.get("section_80c") or 0), 0), SECTION_80C_CAP)
        section_80d = min(max(float(declaration.get("section_80d") or 0), 0), SECTION_80D_CAP)
        home_loan_interest = min(max(float(declaration.get("home_loan_interest") or 0), 0), HOME_LOAN_INTEREST_CAP)
        other_deductions = max(float(declaration.get("other_deductions") or 0), 0)
    else:
        hra_exemption = 0.0
        standard_deduction = 75000.0
        section_80c = section_80d = home_loan_interest = other_deductions = 0.0

    total_deductions = hra_exemption + standard_deduction + section_80c + section_80d + home_loan_interest + other_deductions
    taxable_income = max(0.0, round(projected_gross - total_deductions, 2))

    tax = compute_income_tax(taxable_income, regime)

    remaining = remaining_fy_months(financial_year, from_year, from_month, employee)
    monthly_tds = round(tax["total_tax"] / len(remaining), 2) if remaining else 0.0

    return {
        "financial_year": financial_year,
        "regime": regime,
        "months_employed_in_fy": len(months),
        "projected_annual_gross": projected_gross,
        "hra_exemption": round(hra_exemption, 2),
        "standard_deduction": standard_deduction,
        "section_80c_claimed": round(section_80c, 2),
        "section_80d_claimed": round(section_80d, 2),
        "home_loan_interest_claimed": round(home_loan_interest, 2),
        "other_deductions_claimed": round(other_deductions, 2),
        "taxable_income": taxable_income,
        "income_tax": tax["income_tax"],
        "surcharge": tax["surcharge"],
        "cess": tax["cess"],
        "annual_tax": tax["total_tax"],
        "months_remaining": len(remaining),
        "monthly_tds": monthly_tds,
    }
