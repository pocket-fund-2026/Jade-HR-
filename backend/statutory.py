"""Auto-computed statutory payroll deductions (PF, ESIC — national rates).

These are pure functions: given a wage base and the employee's compliance
flags (hr_employee_profile.pf_applicable / eps_applicable / pf_gross_limit /
esic_applicable), they return the employee-side deduction plus the
employer-side contributions. Callers (payroll.py, routers/salary_structure.py)
are responsible for zeroing these out entirely when the employee's
applicability flag is off — there is no partial/manual override once a flag
is on, by design: corrections belong in the separate ded_pf_arrear /
ded_other_ded line items, not by hand-editing a statutory percentage.

PF wage base is Basic only (no DA field exists in this system). EPS/EDLI are
always capped at the statutory ₹15,000 wage ceiling regardless of what
pf_gross_limit the employer has chosen for the PF-employee-contribution base
itself (pf_gross_limit == 0 means "no cap, use full Basic", per its hint text
in the Compliances tab).

ESIC membership is decided by the employee's esic_applicable flag (HR sets it
per the ₹21,000 entry ceiling and the contribution-period-continuity rule).
Once someone is covered, contributions are computed on their ACTUAL gross
wages even above ₹21,000 — coverage continues to the end of the contribution
period once it has started — and each contribution is rounded UP to the next
whole rupee per the ESIC Act's rounding rule.
"""

import math

PF_EMPLOYEE_RATE = 0.12
PF_EMPLOYER_RATE = 0.12
EPS_RATE = 0.0833
EPS_WAGE_CEILING = 15000
EDLI_RATE = 0.005
EDLI_WAGE_CEILING = 15000
PF_ADMIN_RATE = 0.005

ESIC_EMPLOYEE_RATE = 0.0075
ESIC_EMPLOYER_RATE = 0.0325
ESIC_WAGE_CEILING = 21000

ZERO_PF = {
    "ded_pf": 0.0, "oth_pf_wages": 0.0, "oth_eps_wages": 0.0, "oth_eps": 0.0,
    "oth_epf": 0.0, "oth_edli_wages": 0.0, "oth_edli_charges": 0.0, "oth_pf_admin_charges": 0.0,
}
ZERO_ESIC = {"ded_esic": 0.0, "oth_esic_wages": 0.0, "oth_esic_employer": 0.0}


def compute_pf(wage_base: float, pf_gross_limit: float, eps_applicable: bool) -> dict:
    capped_wage = min(wage_base, pf_gross_limit) if pf_gross_limit else wage_base
    eps_wage = min(capped_wage, EPS_WAGE_CEILING)
    edli_wage = min(capped_wage, EDLI_WAGE_CEILING)
    eps = round(eps_wage * EPS_RATE, 2) if eps_applicable else 0.0
    employer_pf_total = round(capped_wage * PF_EMPLOYER_RATE, 2)
    return {
        "ded_pf": round(capped_wage * PF_EMPLOYEE_RATE, 2),
        "oth_pf_wages": round(capped_wage, 2),
        "oth_eps_wages": round(eps_wage, 2),
        "oth_eps": eps,
        "oth_epf": round(employer_pf_total - eps, 2),
        "oth_edli_wages": round(edli_wage, 2),
        "oth_edli_charges": round(edli_wage * EDLI_RATE, 2),
        "oth_pf_admin_charges": round(capped_wage * PF_ADMIN_RATE, 2),
    }


def compute_esic(gross_wages: float) -> dict:
    """Employee (0.75%) and employer (3.25%) ESIC, each rounded UP to the next
    whole rupee (ESIC Act rounding). Callers gate on esic_applicable; there is
    deliberately no ₹21,000 cutoff here — an already-covered member contributes
    on actual wages above the entry ceiling too (see module docstring)."""
    if gross_wages <= 0:
        return dict(ZERO_ESIC)
    return {
        "ded_esic": float(math.ceil(gross_wages * ESIC_EMPLOYEE_RATE)),
        "oth_esic_wages": round(gross_wages, 2),
        "oth_esic_employer": float(math.ceil(gross_wages * ESIC_EMPLOYER_RATE)),
    }


# Professional Tax (PT) and Labour Welfare Fund (LWF) are state-level, not
# national — verified July 2026 against government/compliance sources for
# JADE's four office states, and cross-checked against a real June 2026
# payslip (Maharashtra, gross ₹33,000 → PT ₹200, LWF ₹25). Delhi has no PT
# law at all. Locations map to these four; anything unmapped gets ₹0 rather
# than a guessed rate.
LOCATION_STATE = {
    "Madhu Estate, Mumbai": "maharashtra",
    "Pedder Road, Mumbai": "maharashtra",
    "Mehrauli (Ambawatta), Delhi": "delhi",
    "Emporio, Delhi": "delhi",
    "Ahmedabad": "gujarat",
    "Kolkata": "west_bengal",
}


def location_to_state(location: str | None) -> str | None:
    if location in LOCATION_STATE:
        return LOCATION_STATE[location]
    loc = (location or "").lower()
    if "mumbai" in loc:
        return "maharashtra"
    if "delhi" in loc:
        return "delhi"
    if "ahmedabad" in loc:
        return "gujarat"
    if "kolkata" in loc:
        return "west_bengal"
    return None


def compute_pt(gross_wages: float, state: str | None, gender: str | None, month: int) -> float:
    """Monthly PT deduction. `month` (1-12) only matters for Maharashtra's
    February ₹300 top-up (11 x ₹200 + 1 x ₹300 = ₹2,500/yr cap)."""
    if state == "maharashtra":
        is_woman = (gender or "").lower() == "female"
        threshold = 25000 if is_woman else 7500
        if gross_wages <= threshold:
            return 0.0
        if not is_woman and gross_wages <= 10000:
            return 175.0
        return 300.0 if month == 2 else 200.0
    if state == "gujarat":
        return 200.0 if gross_wages > 12000 else 0.0
    if state == "west_bengal":
        if gross_wages <= 10000:
            return 0.0
        if gross_wages <= 15000:
            return 110.0
        if gross_wages <= 25000:
            return 130.0
        if gross_wages <= 40000:
            return 150.0
        return 200.0
    # Delhi has no Professional Tax law; unmapped locations default to 0
    # rather than guessing a rate.
    return 0.0


# LWF is half-yearly, not monthly — only deducted in the pay cycles for
# periods ending 30 Jun and 31 Dec (i.e. the June and December payslips).
LWF_RATES = {
    "maharashtra": (25.0, 75.0),
    "delhi": (0.75, 2.25),
    "gujarat": (6.0, 12.0),
    "west_bengal": (3.0, 30.0),
}


def compute_lwf(state: str | None, month: int) -> dict:
    if month not in (6, 12) or state not in LWF_RATES:
        return {"ded_lwf": 0.0, "oth_lwf_wages": 0.0}
    employee, employer = LWF_RATES[state]
    return {"ded_lwf": employee, "oth_lwf_wages": employer}


# --- Income Tax / TDS (Sections 192, 10(13A), 87A of the Income Tax Act) ---
#
# Slabs/standard deduction/87A rebate verified July 2026 for FY 2026-27 (AY
# 2027-28) — Budget 2026 (Feb 2026) made no changes to either regime's
# slabs, standard deduction, 87A rebate, or cess; both continue exactly as
# set by Budget 2025 for FY 2025-26. Source: cleartax.in/s/income-tax-slabs
# and multiple concurring FY2026-27 summaries (bankbazaar, axismaxlife,
# canarahsbclife), cross-checked July 2026.
#
# New Regime is the DEFAULT under the Act (Sec 115BAC) unless an employee
# affirmatively declares the Old Regime — hr_tax_declarations.regime
# defaults to 'new' for the same reason.
NEW_REGIME_SLABS = [
    (400000, 0.0), (800000, 0.05), (1200000, 0.10), (1600000, 0.15),
    (2000000, 0.20), (2400000, 0.25), (float("inf"), 0.30),
]
OLD_REGIME_SLABS = [(250000, 0.0), (500000, 0.05), (1000000, 0.20), (float("inf"), 0.30)]

NEW_REGIME_STANDARD_DEDUCTION = 75000.0
OLD_REGIME_STANDARD_DEDUCTION = 50000.0

# Sec 87A rebate limit — full rebate (tax reduced to nil) up to this taxable
# income; above it, marginal relief caps tax at (taxable_income - limit) so
# nobody nets less take-home than someone earning exactly at the limit. The
# rebate is only available under the regime being computed; there is no
# separate "rebate amount" constant needed because the rebate/relief formula
# below derives it from the slab tax itself (see compute_income_tax).
NEW_REGIME_REBATE_LIMIT = 1200000.0
OLD_REGIME_REBATE_LIMIT = 500000.0

CESS_RATE = 0.04  # Health & Education Cess, both regimes

# Old-regime-only deduction caps (new regime disallows all of these).
SECTION_80C_CAP = 150000.0  # PF/ELSS/life insurance/PPF/etc, Sec 80C
SECTION_80D_CAP = 100000.0  # self+family+parents incl. senior-citizen uplift, Sec 80D (verified: 25k/25k, or 50k where either side is a senior citizen)
HOME_LOAN_INTEREST_CAP = 200000.0  # self-occupied property, Sec 24(b)

# Surcharge — same slabs both regimes except the >5cr band (new regime has
# capped surcharge at 25% since FY 2023-24, abolishing the old 37% band;
# old regime still has it). Included for completeness; JADE's salaries are
# far below ₹50L/yr so this realistically never fires — surcharge's own
# marginal relief (at each of these thresholds) is NOT implemented, since it
# only matters for incomes this system is never expected to see. Flagged as
# a known gap, not a guess.
SURCHARGE_SLABS = [(5000000, 0.0), (10000000, 0.10), (20000000, 0.15), (50000000, 0.25)]
OLD_REGIME_TOP_SURCHARGE_RATE = 0.37


def _slab_tax(taxable_income: float, slabs: list[tuple[float, float]]) -> float:
    tax = 0.0
    lower = 0.0
    for upper, rate in slabs:
        if taxable_income <= lower:
            break
        tax += (min(taxable_income, upper) - lower) * rate
        lower = upper
    return tax


def _surcharge_rate(taxable_income: float, regime: str) -> float:
    rate = 0.0
    for threshold, r in SURCHARGE_SLABS:
        if taxable_income > threshold:
            rate = r
    if regime == "old" and taxable_income > 50000000:
        rate = OLD_REGIME_TOP_SURCHARGE_RATE
    return rate


def compute_income_tax(taxable_income: float, regime: str) -> dict:
    """`regime` is 'old' or 'new'. Applies slab tax, then Sec 87A rebate +
    marginal relief in one step: `min(tax, taxable_income - rebate_limit)`
    is exactly the marginal-relief formula (tax payable never exceeds the
    income exceeding the rebate limit) AND correctly reduces to a full
    rebate (tax=0) once taxable_income <= rebate_limit, since that
    expression is <= 0 there. No separate branch needed."""
    taxable_income = max(0.0, taxable_income)
    slabs = NEW_REGIME_SLABS if regime == "new" else OLD_REGIME_SLABS
    rebate_limit = NEW_REGIME_REBATE_LIMIT if regime == "new" else OLD_REGIME_REBATE_LIMIT

    tax = _slab_tax(taxable_income, slabs)
    if taxable_income <= rebate_limit:
        tax = 0.0
    else:
        tax = max(0.0, min(tax, taxable_income - rebate_limit))

    surcharge = round(tax * _surcharge_rate(taxable_income, regime), 2)
    cess = round((tax + surcharge) * CESS_RATE, 2)
    return {
        "income_tax": round(tax, 2),
        "surcharge": surcharge,
        "cess": cess,
        "total_tax": round(tax + surcharge + cess, 2),
    }


# HRA exemption (Sec 10(13A) / Rule 2A) — only relevant under the Old Regime.
# Metro classification: Mumbai, Delhi, Kolkata, Chennai are the four IT-Act
# metros (50% of Basic); everywhere else, including Ahmedabad, is non-metro
# (40%). JADE has no Chennai office; Kolkata's team was removed from jade-hr
# on 2026-07-11 (see config.py's EXCLUDED_SERIALS note) but the classification
# is kept correct regardless of current headcount there.
METRO_LOCATIONS = {
    "Madhu Estate, Mumbai": True,
    "Pedder Road, Mumbai": True,
    "Mehrauli (Ambawatta), Delhi": True,
    "Emporio, Delhi": True,
    "Ahmedabad": False,
    "Kolkata": True,
}


def location_is_metro(location: str | None) -> bool:
    if location in METRO_LOCATIONS:
        return METRO_LOCATIONS[location]
    loc = (location or "").lower()
    return any(city in loc for city in ("mumbai", "delhi", "kolkata", "chennai"))


def compute_hra_exemption(annual_hra: float, annual_basic: float, annual_rent_paid: float, is_metro: bool) -> float:
    """Least of: actual HRA received, rent paid minus 10% of Basic, 50%/40%
    of Basic (metro/non-metro). Basic only, no DA field in this system —
    same precedent as compute_pf's wage base (see module docstring)."""
    if annual_rent_paid <= 0 or annual_hra <= 0:
        return 0.0
    rent_less_10pct_basic = max(0.0, annual_rent_paid - 0.10 * annual_basic)
    pct_of_basic = (0.50 if is_metro else 0.40) * annual_basic
    return round(max(0.0, min(annual_hra, rent_less_10pct_basic, pct_of_basic)), 2)
