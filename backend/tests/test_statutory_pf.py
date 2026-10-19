from statutory import compute_pf


def test_pf_contributions_round_to_whole_rupee_not_paise():
    # Basic capped at the 15,000 ceiling: EPS = 15000*0.0833 = 1249.5, which
    # must round UP to 1250 (EPFO convention), not stay at 1249.5 — matches
    # Accounts' June 2026 Salary Sheet register (BimalSingh Bhul, PF Wages
    # 15000 -> EPS 1250, EPF 550, EDLI Charges 75, PF Admin Charges 75).
    r = compute_pf(15250, 15000, eps_applicable=True)
    assert r["oth_eps"] == 1250.0
    assert r["oth_epf"] == 550.0  # employer PF total (1800) minus the rounded EPS (1250), not the un-rounded 1249.5
    assert r["oth_edli_charges"] == 75.0
    assert r["oth_pf_admin_charges"] == 75.0
    assert r["ded_pf"] == 1800.0


def test_pf_eps_epf_sum_to_employer_total():
    # EPS + EPF must always reconstitute the full 12% employer contribution —
    # rounding each independently must not let them drift apart.
    r = compute_pf(15250, 15000, eps_applicable=True)
    assert r["oth_eps"] + r["oth_epf"] == 1800.0


def test_pf_deduction_capped_at_3000_from_17_sep_2026():
    from datetime import date
    # 12% of 30,000 = 3,600 -> capped to 3,000 for periods starting on/after 17 Sep 2026
    assert compute_pf(30000, 0, True, date(2026, 9, 23))["ded_pf"] == 3000.0
    assert compute_pf(30000, 0, True, date(2026, 9, 17))["ded_pf"] == 3000.0
    # below the cap stays at plain 12%
    assert compute_pf(20000, 0, True, date(2026, 9, 23))["ded_pf"] == 2400.0


def test_pf_deduction_uncapped_before_17_sep_2026():
    from datetime import date
    assert compute_pf(30000, 0, True, date(2026, 8, 23))["ded_pf"] == 3600.0
    assert compute_pf(30000, 0, True)["ded_pf"] == 3600.0  # no period given = old behaviour
