"""Payment of Gratuity Act, 1972. Pure, no DB access.

Last-drawn "salary" for the 15/26 formula is Basic (+DA in the general
case) — no DA field exists in this system, same precedent as PF's wage
base (see statutory.py's compute_pf docstring).

Eligibility: 5 years of continuous service, waived when service ends due
to death or disablement (Sec 4(1) proviso) — callers pass
`waived_5yr_rule=True` when hr_employee_profile.reason_of_leaving is
'Death' or 'Disablement'. "Continuous service" starts from
hr_employee_profile.gratuity_date if set (covers a rejoinee whose
recognized service predates their current Date of Joining), else
hr_employees.date_of_joining — the caller resolves that, this module just
takes a `service_start` date.

Completed years of service: a part-year of 6 months or more rounds up to
the next full year (the conventional rounding rule applied by essentially
every gratuity calculator and payroll system); anything under 6 months
rounds down.

Statutory ceiling verified July 2026: ₹20,00,000, raised from ₹10,00,000 by
a March 2018 government notification under Sec 4(3); unchanged since. (This
is distinct from the Income Tax Act's Sec 10(10) exemption ceiling for
gratuity RECEIVED, which is a separate, higher figure reported by some
sources as ₹25,00,000 for lump-sum-received tax-exemption purposes — this
module computes the amount PAYABLE under the Act, not its tax treatment, so
that figure is out of scope here.)
"""

from datetime import date

GRATUITY_MIN_SERVICE_YEARS = 5
GRATUITY_STATUTORY_CEILING = 2000000.0
GRATUITY_DAYS_PER_YEAR = 15
GRATUITY_MONTH_DIVISOR = 26


def completed_years_of_service(service_start: date, as_of: date) -> int:
    total_months = (as_of.year - service_start.year) * 12 + (as_of.month - service_start.month)
    if as_of.day < service_start.day:
        total_months -= 1
    years, remainder_months = divmod(max(total_months, 0), 12)
    if remainder_months >= 6:
        years += 1
    return years


def compute_gratuity(last_drawn_basic: float, service_start: date, as_of: date, waived_5yr_rule: bool = False) -> dict:
    years = completed_years_of_service(service_start, as_of)
    eligible = waived_5yr_rule or years >= GRATUITY_MIN_SERVICE_YEARS
    if not eligible:
        return {"eligible": False, "years_of_service": years, "gratuity_amount": 0.0, "capped": False}
    raw_amount = round(last_drawn_basic * GRATUITY_DAYS_PER_YEAR / GRATUITY_MONTH_DIVISOR * years, 2)
    gratuity_amount = min(raw_amount, GRATUITY_STATUTORY_CEILING)
    return {
        "eligible": True,
        "years_of_service": years,
        "gratuity_amount": gratuity_amount,
        "capped": raw_amount > GRATUITY_STATUTORY_CEILING,
    }
