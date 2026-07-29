from routers.leave import (
    CARRY_FORWARD_CAP_HQ,
    CARRY_FORWARD_CAP_RETAIL,
    HQ_LOCATION,
    PAID_LEAVE_ANNUAL_CAP,
    _carry_forward_cap,
    _compute_carry_forward,
    _pl_ledger_from_rows,
)

# doj well before the tested period so accrual is fully capped at 24 for both
# the start and end of the period — isolates the manual-adjustment behavior
# under test from the accrual/carry-forward math already covered above.
_PL_LEDGER_EMPLOYEE = {"id": "emp-1", "date_of_joining": "2020-01-01", "location": "Ahmedabad"}


def test_carry_forward_cap_hq_vs_retail():
    assert _carry_forward_cap(HQ_LOCATION) == CARRY_FORWARD_CAP_HQ == 15
    assert _carry_forward_cap("Ahmedabad") == CARRY_FORWARD_CAP_RETAIL == 7
    assert _carry_forward_cap("Pedder Road, Mumbai") == CARRY_FORWARD_CAP_RETAIL  # a second Mumbai store, NOT HQ
    assert _carry_forward_cap("Mehrauli (Ambawatta), Delhi") == CARRY_FORWARD_CAP_RETAIL
    assert _carry_forward_cap(None) == CARRY_FORWARD_CAP_RETAIL  # unknown/unset location defaults to the lower cap


def test_carry_forward_matches_documented_hq_example():
    # 24 allocated, only 4 taken -> 20 unused, but HQ's 15-day cap means only
    # 15 carry forward and the remaining 5 expire.
    assert _compute_carry_forward(0, PAID_LEAVE_ANNUAL_CAP, 4, CARRY_FORWARD_CAP_HQ) == 15


def test_carry_forward_matches_documented_retail_example():
    # Same 20 unused, but retail's 7-day cap means only 7 carry forward.
    assert _compute_carry_forward(0, PAID_LEAVE_ANNUAL_CAP, 4, CARRY_FORWARD_CAP_RETAIL) == 7


def test_carry_forward_below_cap_carries_in_full():
    # Took 20 of 24 -> only 4 unused, under both caps -> all 4 carry forward.
    assert _compute_carry_forward(0, PAID_LEAVE_ANNUAL_CAP, 20, CARRY_FORWARD_CAP_HQ) == 4
    assert _compute_carry_forward(0, PAID_LEAVE_ANNUAL_CAP, 20, CARRY_FORWARD_CAP_RETAIL) == 4


def test_carry_forward_never_negative_when_overdrawn():
    # Defensive: even if usage somehow exceeded the allocation, carry-forward
    # floors at 0 rather than going negative.
    assert _compute_carry_forward(0, PAID_LEAVE_ANNUAL_CAP, 30, CARRY_FORWARD_CAP_HQ) == 0


def test_carry_forward_compounds_across_years():
    # Year 2 starts with 10 already carried in from year 1, accrues another
    # 24, uses only 2 -> 32 unused, still capped at 15 for HQ.
    assert _compute_carry_forward(10, PAID_LEAVE_ANNUAL_CAP, 2, CARRY_FORWARD_CAP_HQ) == 15


def test_carry_forward_includes_manual_ledger_adjustment():
    # HR granted +5 via the Leave Entry page during the year (prior_manual) —
    # that must count toward carry-forward same as accrual, not be silently
    # dropped (the original bug: manual adjustments never fed the real balance).
    assert _compute_carry_forward(0, PAID_LEAVE_ANNUAL_CAP, 4, CARRY_FORWARD_CAP_RETAIL, prior_manual=5) == 7  # capped
    assert _compute_carry_forward(0, 10, 4, CARRY_FORWARD_CAP_HQ, prior_manual=5) == 11  # 10+5-4, under cap


def test_carry_forward_manual_debit_reduces_balance():
    # A manual debit/correction (negative amount) lowers what carries forward.
    assert _compute_carry_forward(0, 10, 0, CARRY_FORWARD_CAP_HQ, prior_manual=-3) == 7


def test_pl_ledger_folds_in_manual_credit_posted_within_the_period():
    # Regression: HR's Leave Entry adjustments (hr_leave_ledger) used to only
    # ever reach carry-forward the FOLLOWING leave-year — a mid-year manual
    # credit was invisible on every payslip's PL ledger row until then, even
    # though it already updated the dashboard balance immediately.
    baseline = _pl_ledger_from_rows(
        _PL_LEDGER_EMPLOYEE, 2026, 7, [],
        carry_at_start=0.0, carry_at_end=0.0, manual_before=0.0, manual_within=0.0,
    )
    ledger = _pl_ledger_from_rows(
        _PL_LEDGER_EMPLOYEE, 2026, 7, [],
        carry_at_start=0.0, carry_at_end=0.0, manual_before=0.0, manual_within=5.0,
    )
    assert ledger["credit"] == baseline["credit"] + 5.0
    assert ledger["debit"] == baseline["debit"]
    assert ledger["closing"] == baseline["closing"] + 5.0


def test_pl_ledger_folds_in_manual_debit_posted_within_the_period_as_debit_not_negative_credit():
    # A manual debit (negative amount) posted mid-period must show up in the
    # Dr column, not push Cr negative.
    baseline = _pl_ledger_from_rows(
        _PL_LEDGER_EMPLOYEE, 2026, 7, [],
        carry_at_start=0.0, carry_at_end=0.0, manual_before=0.0, manual_within=0.0,
    )
    ledger = _pl_ledger_from_rows(
        _PL_LEDGER_EMPLOYEE, 2026, 7, [],
        carry_at_start=0.0, carry_at_end=0.0, manual_before=0.0, manual_within=-3.0,
    )
    assert ledger["credit"] == baseline["credit"]
    assert ledger["debit"] == baseline["debit"] + 3.0
    assert ledger["closing"] == baseline["closing"] - 3.0


def test_pl_ledger_folds_in_manual_adjustment_posted_before_the_period_into_opening():
    # A manual adjustment posted earlier in the same (still-open) leave-year,
    # before this pay period even started, must already be part of Opening —
    # not wait for a carry-forward that only ever locks in at year-end.
    ledger = _pl_ledger_from_rows(
        _PL_LEDGER_EMPLOYEE, 2026, 7, [],
        carry_at_start=0.0, carry_at_end=0.0, manual_before=5.0, manual_within=0.0,
    )
    baseline = _pl_ledger_from_rows(
        _PL_LEDGER_EMPLOYEE, 2026, 7, [],
        carry_at_start=0.0, carry_at_end=0.0, manual_before=0.0, manual_within=0.0,
    )
    assert ledger["opening"] == baseline["opening"] + 5.0
    assert ledger["closing"] == baseline["closing"] + 5.0
