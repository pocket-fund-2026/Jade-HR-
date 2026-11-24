from datetime import date

import pytest

from arrears_calc import (
    ARREAR_NET_PAY_FROM, apply_arrears, calculate_revision_arrear, pay_period_for_date, period_bounds,
)


def test_pay_period_for_date_boundaries():
    assert pay_period_for_date(date(2026, 11, 22)) == (2026, 11)
    assert pay_period_for_date(date(2026, 11, 23)) == (2026, 12)
    assert pay_period_for_date(date(2026, 12, 23)) == (2027, 1)
    assert pay_period_for_date(date(2027, 1, 1)) == (2027, 1)


def test_period_bounds_january_wraps_year():
    assert period_bounds(2027, 1) == (date(2026, 12, 23), date(2027, 1, 22))


def test_full_months_revision():
    # 3 whole pay periods, +5,000/month
    r = calculate_revision_arrear(30000, 35000, date(2026, 9, 23), date(2026, 12, 22))
    assert [l["pay_month"] for l in r["lines"]] == [10, 11, 12]
    assert r["monthly_difference"] == 5000
    assert r["total"] == 15000


def test_partial_first_period_prorated_by_days():
    # Oct period is 23 Sep-22 Oct = 30 days; revision from 8 Oct = 15 days
    r = calculate_revision_arrear(20000, 21000, date(2026, 10, 8), date(2026, 10, 22))
    assert r["lines"][0]["days"] == 15 and r["lines"][0]["period_days"] == 30
    assert r["total"] == 500.0


def test_negative_revision_is_a_recovery():
    assert calculate_revision_arrear(30000, 28000, date(2026, 10, 23), date(2026, 11, 22))["total"] == -2000


def test_bad_range_rejected():
    with pytest.raises(ValueError):
        calculate_revision_arrear(1, 2, date(2026, 5, 1), date(2026, 4, 1))


def test_apply_arrears_changes_net_only_from_go_live():
    items = [{"arrear_amount": 10000, "tds_amount": 1000}]
    before = apply_arrears({"total_payable": 20000.0}, items, 2026, 11)
    assert before["arrear"] == 10000 and before["total_payable"] == 20000.0 and not before["arrear_in_net"]
    live = apply_arrears({"total_payable": 20000.0}, items, *ARREAR_NET_PAY_FROM)
    assert live["total_payable"] == 29000.0 and live["arrear_in_net"]


def test_apply_arrears_no_items_and_calc_error_untouched():
    s = apply_arrears({"total_payable": 5.0}, [], 2027, 1)
    assert s["arrear"] == 0 and s["total_payable"] == 5.0 and not s["arrear_in_net"]
    failed = apply_arrears({"total_payable": 0, "calc_error": "x"}, [{"arrear_amount": 9}], 2027, 1)
    assert failed["total_payable"] == 0
