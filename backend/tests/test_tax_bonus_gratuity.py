from datetime import date

from bonus import compute_bonus
from gratuity import compute_gratuity, completed_years_of_service
from statutory import compute_hra_exemption, compute_income_tax, location_is_metro
from tds import DEFAULT_DECLARATION, project_annual_tax


def test_new_regime_full_rebate_at_exactly_12_lakh():
    r = compute_income_tax(1200000, "new")
    assert r["total_tax"] == 0.0


def test_new_regime_marginal_relief_just_above_rebate_limit():
    # Slab tax on 12.1L is 61500; marginal relief caps it at the 10,000
    # excess over the 12L limit, then 4% cess on top.
    r = compute_income_tax(1210000, "new")
    assert r["income_tax"] == 10000.0
    assert r["total_tax"] == 10400.0


def test_old_regime_marginal_relief_just_above_5_lakh():
    r = compute_income_tax(510000, "old")
    assert r["income_tax"] == 10000.0
    assert r["total_tax"] == 10400.0


def test_old_regime_full_slab_computation_above_rebate_zone():
    # 0-2.5L nil, 2.5-5L@5%=12500, 5-10L@20%=100000, 10-12L@30%=60000
    r = compute_income_tax(1200000, "old")
    assert r["income_tax"] == 172500.0


def test_hra_exemption_is_least_of_three_and_metro_sensitive():
    metro = compute_hra_exemption(115200, 192000, 240000, True)
    assert metro == 96000.0  # 50% of annual Basic is the binding constraint
    non_metro = compute_hra_exemption(115200, 192000, 240000, False)
    assert non_metro == 76800.0  # 40% of annual Basic


def test_hra_exemption_zero_without_rent():
    assert compute_hra_exemption(115200, 192000, 0, True) == 0.0


def test_metro_classification():
    assert location_is_metro("Madhu Estate, Mumbai") is True
    assert location_is_metro("Mehrauli (Ambawatta), Delhi") is True
    assert location_is_metro("Kolkata") is True
    assert location_is_metro("Ahmedabad") is False


def test_bonus_eligibility_wage_ceiling():
    assert compute_bonus(15000, 300, 0.0833, 12)["eligible"] is True
    assert compute_bonus(25000, 300, 0.0833, 12)["eligible"] is False  # over 21,000 ceiling


def test_bonus_eligibility_min_service_days():
    assert compute_bonus(15000, 20, 0.0833, 12)["eligible"] is False  # under 30 days


def test_bonus_wage_is_capped_at_7000_per_month():
    b = compute_bonus(15000, 300, 0.0833, 12)
    assert b["bonus_wage"] == 7000 * 12


def test_bonus_rate_clamped_to_statutory_range():
    assert compute_bonus(15000, 300, 0.5, 12)["rate"] == 0.20
    assert compute_bonus(15000, 300, 0.01, 12)["rate"] == 0.0833


def test_gratuity_years_rounds_up_at_six_months():
    assert completed_years_of_service(date(2020, 1, 15), date(2026, 7, 11)) == 6  # 6y5m -> 6
    assert completed_years_of_service(date(2020, 1, 15), date(2026, 7, 20)) == 7  # 6y6m -> 7


def test_gratuity_ineligible_under_five_years_without_waiver():
    g = compute_gratuity(20000, date(2023, 1, 1), date(2026, 7, 11))
    assert g["eligible"] is False


def test_gratuity_death_disablement_waives_five_year_rule():
    g = compute_gratuity(20000, date(2023, 1, 1), date(2026, 7, 11), waived_5yr_rule=True)
    assert g["eligible"] is True


def test_gratuity_formula_and_statutory_ceiling():
    g = compute_gratuity(20000, date(2021, 7, 11), date(2026, 7, 11))
    assert g["gratuity_amount"] == round(20000 * 15 / 26 * 5, 2)
    assert g["capped"] is False

    capped = compute_gratuity(500000, date(1990, 1, 1), date(2026, 7, 11))
    assert capped["gratuity_amount"] == 2000000.0
    assert capped["capped"] is True


EMPLOYEE = {
    "id": "e1", "basic": 80000, "hra": 40000, "conveyance": 2000, "other_allowance": 5000,
    "monthly_bonus": 0, "retention": 0, "incentive": 0,
    "date_of_joining": "2020-01-01", "location": "Madhu Estate, Mumbai",
}


def test_project_annual_tax_low_wage_employee_owes_nothing():
    low_wage = {**EMPLOYEE, "basic": 12000, "hra": 5000, "conveyance": 1200, "other_allowance": 0}
    proj = project_annual_tax(low_wage, "2026-27", DEFAULT_DECLARATION, 2026, 7)
    assert proj["monthly_tds"] == 0.0


def test_project_annual_tax_months_remaining_counts_from_the_payslip_month():
    proj = project_annual_tax(EMPLOYEE, "2026-27", DEFAULT_DECLARATION, 2026, 7)
    assert proj["months_remaining"] == 9  # Jul through Mar inclusive


def test_project_annual_tax_bounds_months_employed_by_date_of_joining():
    mid_year_joiner = {**EMPLOYEE, "date_of_joining": "2026-12-05"}
    proj = project_annual_tax(mid_year_joiner, "2026-27", DEFAULT_DECLARATION, 2026, 7)
    assert proj["months_employed_in_fy"] == 4  # Dec, Jan, Feb, Mar labels only


def test_project_annual_tax_old_regime_deductions_reduce_taxable_income():
    declaration = {
        "regime": "old", "rent_paid_annual": 300000, "section_80c": 150000,
        "section_80d": 25000, "home_loan_interest": 0, "other_deductions": 0,
    }
    proj_old = project_annual_tax(EMPLOYEE, "2026-27", declaration, 2026, 7)
    proj_new = project_annual_tax(EMPLOYEE, "2026-27", DEFAULT_DECLARATION, 2026, 7)
    assert proj_old["hra_exemption"] > 0
    assert proj_old["taxable_income"] < proj_new["taxable_income"]
