"""Payment of Bonus Act, 1965 — annual statutory bonus calculation. Pure,
no DB access.

Eligibility: employees earning up to BONUS_ELIGIBILITY_WAGE_CEILING/month
(Basic — no DA field in this system, same precedent as PF's wage base, see
statutory.py's compute_pf docstring) who worked at least
BONUS_MIN_SERVICE_DAYS days in the accounting year. "Worked" is interpreted
per Sec 14 of the Act (which counts weekly offs/paid leave/festival
holidays as working days, not just literal attendance) — callers should
pass the sum of `paid_days` across the FY's applicable months, not
`present_days`.

Bonus computation base: by company policy (confirmed 2026-07-15, JADE HR
ops), bonus is paid on the employee's ACTUAL Basic actually drawn each
month across the accounting year, summed — NOT capped at the Sec 12
calculation ceiling (BONUS_CALC_CEILING, kept below only for reference/
documentation of the statutory floor this exceeds). This is more generous
than the Act requires, which is permitted — Sec 12's cap is a minimum
floor for the calculation, not a ceiling employers must apply.

Verified July 2026: ceilings/rates unchanged since the Payment of Bonus
(Amendment) Act, 2015 (effective 2016).
"""

BONUS_ELIGIBILITY_WAGE_CEILING = 21000.0
BONUS_CALC_CEILING = 7000.0  # statutory floor only — not applied, see module docstring
BONUS_MIN_RATE = 0.0833
BONUS_MAX_RATE = 0.20
BONUS_MIN_SERVICE_DAYS = 30


def compute_bonus(
    monthly_basic_for_eligibility: float, basic_wage_sum: float, days_worked_in_year: float,
    rate: float = BONUS_MIN_RATE,
) -> dict:
    """`monthly_basic_for_eligibility` is the employee's current flat Basic,
    checked against the eligibility ceiling. `basic_wage_sum` is the actual
    Basic drawn each FY month (already prorated for attendance), summed by
    the caller across every applicable month — the uncapped bonus
    calculation base (see module docstring). `rate` defaults to the
    statutory minimum (8.33%); an employer may declare a higher rate (up to
    20%) if allocable surplus supports it — that's a once-a-year board
    decision, passed in by the caller (the report endpoint), not a
    per-employee input."""
    eligible = monthly_basic_for_eligibility <= BONUS_ELIGIBILITY_WAGE_CEILING and days_worked_in_year >= BONUS_MIN_SERVICE_DAYS
    if not eligible:
        return {"eligible": False, "bonus_wage": 0.0, "rate": 0.0, "bonus_amount": 0.0}
    rate = max(BONUS_MIN_RATE, min(rate, BONUS_MAX_RATE))
    bonus_wage = round(basic_wage_sum, 2)
    bonus_amount = round(bonus_wage * rate, 2)
    return {"eligible": True, "bonus_wage": bonus_wage, "rate": rate, "bonus_amount": bonus_amount}
