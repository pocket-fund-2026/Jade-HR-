from routers.leave import (
    CARRY_FORWARD_CAP_HQ,
    CARRY_FORWARD_CAP_RETAIL,
    HQ_LOCATION,
    PAID_LEAVE_ANNUAL_CAP,
    _carry_forward_cap,
    _compute_carry_forward,
)


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
