from datetime import date, datetime, time, timezone

from config import IST
from payroll import (
    LATE_POLICY_V2_EFFECTIVE,
    compute_daily_attendance,
    compute_monthly_summary,
    days_in_month,
    fy_quarter_for_month,
    group_punches_by_day,
    late_card_status,
    late_policy_params,
    pay_period_bounds,
    quarter_month_labels,
)

EMPLOYEE = {
    "id": "emp-1",
    "employee_code": "E001",
    "first_name": "Sarita",
    "last_name": "",
    "location": "Madhu Estate, Mumbai",
    "basic": 16000,
    "hra": 9600,
    "conveyance": 1200,
    "standard_hours_per_day": 8,
    "weekly_off_day": 6,  # Sunday
}

CORPORATE_EMPLOYEE = {**EMPLOYEE, "id": "emp-2", "employee_code": "E002", "employee_category": "corporate"}


def test_pay_period_bounds_within_year():
    start, end = pay_period_bounds(2026, 7)
    assert start == date(2026, 6, 23)
    assert end == date(2026, 7, 22)


def test_pay_period_bounds_january_wraps_to_prior_december():
    start, end = pay_period_bounds(2026, 1)
    assert start == date(2025, 12, 23)
    assert end == date(2026, 1, 22)


def test_days_in_month_spans_a_year_boundary_correctly():
    # Dec 23 2025 - Jan 22 2026 = 31 days, even though it crosses New Year's.
    assert days_in_month(2026, 1) == 31
    # Jun 23 - Jul 22 2026 = 30 days.
    assert days_in_month(2026, 7) == 30


def test_group_punches_by_day_uses_ist_calendar_not_utc():
    # 2026-07-08 19:00 UTC = 2026-07-09 00:30 IST — must file under the IST
    # date, not the UTC date. This is the exact bug fixed in 6e0c12c.
    punch = datetime(2026, 7, 8, 19, 0, tzinfo=timezone.utc)
    by_day = group_punches_by_day([punch])
    assert date(2026, 7, 9) in by_day
    assert date(2026, 7, 8) not in by_day


def test_late_grace_boundary_is_exclusive():
    # Exactly 10:11 IST counts as on time; a second later is late.
    on_time = datetime(2026, 1, 5, 10, 11, 0, tzinfo=IST)
    late = datetime(2026, 1, 5, 10, 11, 1, tzinfo=IST)
    out = datetime(2026, 1, 5, 18, 0, tzinfo=IST)

    rows_on_time = compute_daily_attendance(2026, 1, [on_time, out], 8, weekly_off_day=6)
    rows_late = compute_daily_attendance(2026, 1, [late, out], 8, weekly_off_day=6)

    row_on_time = next(r for r in rows_on_time if r["date"] == "2026-01-05")
    row_late = next(r for r in rows_late if r["date"] == "2026-01-05")
    assert row_on_time["late"] is False
    assert row_late["late"] is True


def test_late_grace_default_10am_shift_unaffected_by_time_slot_change():
    # No time_slot (or an unrecognized value) must still behave exactly like
    # the old single-global-constant 10:11 AM grace. "Flexible" is NOT part of
    # this fallback — see the flexible-time_slot tests below.
    on_time = datetime(2026, 1, 5, 10, 11, 0, tzinfo=IST)
    late = datetime(2026, 1, 5, 10, 11, 1, tzinfo=IST)
    out = datetime(2026, 1, 5, 18, 0, tzinfo=IST)
    for time_slot in (None, "some-unrecognized-value"):
        rows_on_time = compute_daily_attendance(2026, 1, [on_time, out], 8, weekly_off_day=6, time_slot=time_slot)
        rows_late = compute_daily_attendance(2026, 1, [late, out], 8, weekly_off_day=6, time_slot=time_slot)
        assert next(r for r in rows_on_time if r["date"] == "2026-01-05")["late"] is False
        assert next(r for r in rows_late if r["date"] == "2026-01-05")["late"] is True


def test_flexible_time_slot_late_arrival_but_full_hours_is_not_late():
    # A "Flexible" employee (e.g. Sagar) has no fixed clock-in cutoff at all —
    # arriving at 1 PM is fine as long as they complete their 8 standard
    # hours that day. Previously this fell back to the 10:11 AM default grace
    # and got wrongly flagged late.
    in_time = datetime(2026, 1, 5, 13, 0, tzinfo=IST)
    out = datetime(2026, 1, 5, 21, 0, tzinfo=IST)  # exactly 8 hours
    rows = compute_daily_attendance(2026, 1, [in_time, out], 8, weekly_off_day=6, time_slot="Flexible")
    row = next(r for r in rows if r["date"] == "2026-01-05")
    assert row["late"] is False


def test_flexible_time_slot_short_hours_is_late():
    # Same Flexible employee, but they left early and fell short of their 8
    # standard hours — this is what should now trip the late flag instead of
    # arrival time.
    in_time = datetime(2026, 1, 5, 10, 0, tzinfo=IST)
    out = datetime(2026, 1, 5, 17, 0, tzinfo=IST)  # only 7 hours
    rows = compute_daily_attendance(2026, 1, [in_time, out], 8, weekly_off_day=6, time_slot="Flexible")
    row = next(r for r in rows if r["date"] == "2026-01-05")
    assert row["late"] is True


def test_late_grace_11am_shift_employee_arriving_1030am_not_late():
    # An employee moved to "11:00 AM – 8:00 PM" must be graced against THAT
    # shift's start (11:00 + 11min = 11:11), not the global 10:11 default —
    # 10:30 AM would have been incorrectly flagged late under the old
    # single-global-constant logic.
    in_time = datetime(2026, 1, 5, 10, 30, tzinfo=IST)
    out = datetime(2026, 1, 5, 20, 0, tzinfo=IST)
    rows = compute_daily_attendance(
        2026, 1, [in_time, out], 8, weekly_off_day=6, time_slot="11:00 AM – 8:00 PM",
    )
    row = next(r for r in rows if r["date"] == "2026-01-05")
    assert row["late"] is False


def test_late_grace_11am_shift_employee_arriving_1115am_is_late():
    # Same 11 AM shift employee, but now past their 11:11 grace cutoff.
    in_time = datetime(2026, 1, 5, 11, 15, tzinfo=IST)
    out = datetime(2026, 1, 5, 20, 0, tzinfo=IST)
    rows = compute_daily_attendance(
        2026, 1, [in_time, out], 8, weekly_off_day=6, time_slot="11:00 AM – 8:00 PM",
    )
    row = next(r for r in rows if r["date"] == "2026-01-05")
    assert row["late"] is True


def test_stay_back_past_830pm_extends_next_day_grace_to_11am():
    day1 = [datetime(2026, 1, 5, 10, 0, tzinfo=IST), datetime(2026, 1, 5, 20, 31, tzinfo=IST)]
    # 10:45am would normally be late (past 10:11) but is within the extended 11am grace.
    day2 = [datetime(2026, 1, 6, 10, 45, tzinfo=IST), datetime(2026, 1, 6, 19, 0, tzinfo=IST)]
    rows = compute_daily_attendance(2026, 1, day1 + day2, 8, weekly_off_day=6)
    row2 = next(r for r in rows if r["date"] == "2026-01-06")
    assert row2["late"] is False


def test_finish_before_midnight_gives_11am_grace_not_noon():
    # v1.1 §4: only a past-MIDNIGHT finish earns the noon grace. A finish that
    # ran past 8:30 PM but before midnight (e.g. 10:30 PM) earns 11 AM only.
    day1 = [datetime(2026, 1, 5, 10, 0, tzinfo=IST), datetime(2026, 1, 5, 22, 30, tzinfo=IST)]
    # 10:45am is within the 11am grace...
    day2_ok = [datetime(2026, 1, 6, 10, 45, tzinfo=IST), datetime(2026, 1, 6, 19, 0, tzinfo=IST)]
    rows_ok = compute_daily_attendance(2026, 1, day1 + day2_ok, 8, weekly_off_day=6)
    assert next(r for r in rows_ok if r["date"] == "2026-01-06")["late"] is False
    # ...but 11:45am is NOT (it would have been fine under the old 10:30pm->noon tier).
    day2_late = [datetime(2026, 1, 6, 11, 45, tzinfo=IST), datetime(2026, 1, 6, 19, 0, tzinfo=IST)]
    rows_late = compute_daily_attendance(2026, 1, day1 + day2_late, 8, weekly_off_day=6)
    assert next(r for r in rows_late if r["date"] == "2026-01-06")["late"] is True


def test_stay_back_past_midnight_extends_next_day_grace_to_noon():
    # Jan 5's shift runs past midnight, so its real finish (00:30) is bucketed
    # under Jan 6 by IST calendar date, not Jan 5. v1.1 §4: a past-midnight
    # finish lets them report by 12:00 PM next day WITHOUT a late mark — a
    # grace extension, NOT a comp-off.
    day1_in = datetime(2026, 1, 5, 10, 0, tzinfo=IST)
    day1_true_out = datetime(2026, 1, 6, 0, 30, tzinfo=IST)
    day2_real_in = datetime(2026, 1, 6, 11, 45, tzinfo=IST)  # within the extended noon grace
    day2_out = datetime(2026, 1, 6, 19, 0, tzinfo=IST)
    rows = compute_daily_attendance(
        2026, 1, [day1_in, day1_true_out, day2_real_in, day2_out], 8, weekly_off_day=6, is_corporate=True,
    )
    row1 = next(r for r in rows if r["date"] == "2026-01-05")
    row2 = next(r for r in rows if r["date"] == "2026-01-06")

    # NOT a comp-off — comp-off is only weekly-off / declared-holiday work now.
    assert "comp_off_eligible" not in row1
    assert "midnight_comp_off" not in row1
    # Day 2's own first_in must reflect the REAL 11:45am arrival, not the
    # stray 00:30 tail punch left over from Jan 5's shift.
    assert row2["first_in"] == day2_real_in.isoformat()
    # Past-midnight finish -> 12:00 PM grace -> 11:45am is on time.
    assert row2["late"] is False

    # Past noon is still late even with the extension.
    day2_past_noon = datetime(2026, 1, 6, 12, 15, tzinfo=IST)
    rows_late = compute_daily_attendance(
        2026, 1, [day1_in, day1_true_out, day2_past_noon, day2_out], 8, weekly_off_day=6, is_corporate=True,
    )
    assert next(r for r in rows_late if r["date"] == "2026-01-06")["late"] is True


def test_normal_finish_does_not_extend_next_day_grace():
    day1 = [datetime(2026, 1, 5, 10, 0, tzinfo=IST), datetime(2026, 1, 5, 19, 0, tzinfo=IST)]  # ordinary finish
    day2 = [datetime(2026, 1, 6, 10, 30, tzinfo=IST), datetime(2026, 1, 6, 19, 0, tzinfo=IST)]  # past normal 10:11 grace
    rows = compute_daily_attendance(2026, 1, day1 + day2, 8, weekly_off_day=6)
    row2 = next(r for r in rows if r["date"] == "2026-01-06")
    assert row2["late"] is True


def test_weekly_off_only_paid_if_earned():
    # PL & Weekly-Off rule: a weekly-off is only automatically paid if the
    # employee attended >=3 days that week, or was on Paid Leave the whole
    # week. 2026-01-04 is a Sunday with zero attendance and zero leave in
    # the week before it -> not earned -> absent, not a free weekoff.
    rows = compute_daily_attendance(2026, 1, [], 8, weekly_off_day=6)
    sunday_row = next(r for r in rows if r["date"] == "2026-01-04")
    assert sunday_row["status"] == "absent"

    # A non-Sunday day with no punches falls back to absent regardless.
    monday_row = next(r for r in rows if r["date"] == "2025-12-29")
    assert monday_row["status"] == "absent"


def test_weekly_off_stays_paid_with_three_attended_days():
    # Jan 11 2026 is a Sunday; present Jan 5,6,7 (Mon-Wed that week) earns
    # the weekoff even though the rest of the week is unaccounted for.
    punches = []
    for d in (5, 6, 7):
        punches.append(datetime(2026, 1, d, 10, 0, tzinfo=IST))
        punches.append(datetime(2026, 1, d, 19, 0, tzinfo=IST))
    rows = compute_daily_attendance(2026, 1, punches, 8, weekly_off_day=6)
    sunday_row = next(r for r in rows if r["date"] == "2026-01-11")
    assert sunday_row["status"] == "weekoff"


def test_weekly_off_becomes_paid_leave_for_a_full_pl_week():
    # A Paid Leave request covering the 6 days before a Sunday (but not the
    # Sunday itself) still converts that Sunday to Paid Leave too.
    leaves = {date(2026, 1, d): "paid" for d in range(5, 11)}  # Mon 5 - Sat 10
    rows = compute_daily_attendance(2026, 1, [], 8, leaves=leaves, weekly_off_day=6)
    sunday_row = next(r for r in rows if r["date"] == "2026-01-11")
    assert sunday_row["status"] == "leave"
    assert sunday_row["leave_type"] == "paid"


def test_leave_fills_in_for_a_day_with_no_punches():
    leaves = {date(2026, 1, 10): "sick"}
    rows = compute_daily_attendance(2026, 1, [], 8, leaves=leaves, weekly_off_day=6)
    row = next(r for r in rows if r["date"] == "2026-01-10")
    assert row["status"] == "leave"
    assert row["leave_type"] == "sick"


def test_override_takes_priority_over_raw_punches():
    # Employee actually punched in/out, but an admin-approved dispute
    # override for the same day should win over the raw punch data.
    punch_in = datetime(2026, 1, 6, 9, 0, tzinfo=IST)
    punch_out = datetime(2026, 1, 6, 17, 0, tzinfo=IST)
    overrides = {
        date(2026, 1, 6): {
            "status_override": "present",
            "first_in": time(8, 0),
            "last_out": time(20, 0),
        }
    }
    rows = compute_daily_attendance(2026, 1, [punch_in, punch_out], 8, overrides=overrides, weekly_off_day=6)
    row = next(r for r in rows if r["date"] == "2026-01-06")
    assert row["corrected"] is True
    assert row["hours_worked"] == 12.0  # 8:00-20:00, not the raw 9:00-17:00 punch


def test_compute_monthly_summary_ot_formula_matches_documented_example():
    # Single 10-hour day (2h worked past standard) in an otherwise-empty
    # 31-day period. EMPLOYEE's gross (26,800 = 16,000 + 9,600 + 1,200) is
    # above OT_ELIGIBLE_GROSS_CEILING (25,000), so under the OT-eligibility
    # policy this employee earns no OT at all — see
    # test_compute_monthly_summary_ot_formula_for_ot_eligible_employee below
    # for the same formula/arithmetic on an employee under the ceiling.
    punch_in = datetime(2026, 1, 5, 9, 0, tzinfo=IST)
    punch_out = datetime(2026, 1, 5, 19, 0, tzinfo=IST)

    summary = compute_monthly_summary(EMPLOYEE, 2026, 1, [punch_in, punch_out])

    assert summary["days_in_month"] == 31
    assert summary["total_ot_hours"] == 0.0
    # OT's per-day/per-hour divisor always uses the full monthly rate
    # (26,800 = 16,000 + 9,600 + 1,200), never the prorated actual below —
    # still computed regardless of OT eligibility, just unused for ot_amount.
    assert summary["per_day_salary"] == 864.52  # 26800 / 31
    assert summary["per_hour_salary"] == 108.06  # per_day_salary / 8
    assert summary["ot_amount"] == 0.0  # gross above the OT ceiling -> no OT pay
    # Only 1 present day in this otherwise-empty period, and every weekoff's
    # week falls short of 3 attended days / a full Paid Leave week -> none of
    # the 4 weekoffs are earned (see the weekly-off-earning-rule tests) ->
    # paid_days = 1, so Basic/HRA/Conveyance are prorated to 1/31 of rate.
    assert summary["paid_days"] == 1.0
    assert summary["basic"] == 516.13  # 16000 * 1/31
    assert summary["gross_salary"] == 864.52  # 516.13 + 309.68 + 38.71
    assert summary["total_payable"] == 864.52  # gross_salary only — ot_amount is 0


def test_compute_monthly_summary_ot_formula_for_ot_eligible_employee():
    # Same 10-hour day (2h OT) as the test above, but for an employee whose
    # gross (12,000 + 3,000 + 1,000 = 16,000) is at/below
    # OT_ELIGIBLE_GROSS_CEILING (25,000) -> OT is actually paid.
    low_gross_employee = {**EMPLOYEE, "basic": 12000, "hra": 3000, "conveyance": 1000}
    punch_in = datetime(2026, 1, 5, 9, 0, tzinfo=IST)
    punch_out = datetime(2026, 1, 5, 19, 0, tzinfo=IST)

    summary = compute_monthly_summary(low_gross_employee, 2026, 1, [punch_in, punch_out])

    assert summary["total_ot_hours"] == 2.0
    assert summary["per_day_salary"] == 516.13  # 16000 / 31
    assert summary["per_hour_salary"] == 64.52  # per_day_salary / 8
    assert summary["ot_amount"] == 129.03  # unrounded per_hour_salary * 2h, then rounded
    assert summary["total_payable"] == round(summary["gross_salary"] + 129.03, 2)


def test_compute_monthly_summary_ot_ceiling_is_inclusive_at_exactly_25000():
    at_ceiling = {**EMPLOYEE, "basic": 20000, "hra": 4000, "conveyance": 1000}  # gross exactly 25000
    over_ceiling = {**EMPLOYEE, "basic": 20000, "hra": 4000, "conveyance": 1001}  # gross 25001
    punch_in = datetime(2026, 1, 5, 9, 0, tzinfo=IST)
    punch_out = datetime(2026, 1, 5, 19, 0, tzinfo=IST)

    at_summary = compute_monthly_summary(at_ceiling, 2026, 1, [punch_in, punch_out])
    over_summary = compute_monthly_summary(over_ceiling, 2026, 1, [punch_in, punch_out])

    assert at_summary["total_ot_hours"] == 2.0
    assert at_summary["ot_amount"] > 0
    assert over_summary["total_ot_hours"] == 0.0
    assert over_summary["ot_amount"] == 0.0


def test_compute_monthly_summary_ot_applicable_false_overrides_low_gross():
    # The pre-existing per-employee ot_applicable flag still works as an
    # independent override even for an employee under the gross ceiling.
    low_gross_ot_off = {**EMPLOYEE, "basic": 12000, "hra": 3000, "conveyance": 1000, "ot_applicable": False}
    punch_in = datetime(2026, 1, 5, 9, 0, tzinfo=IST)
    punch_out = datetime(2026, 1, 5, 19, 0, tzinfo=IST)

    summary = compute_monthly_summary(low_gross_ot_off, 2026, 1, [punch_in, punch_out])

    assert summary["total_ot_hours"] == 0.0
    assert summary["ot_amount"] == 0.0


def _late_punch(y, m, d, hour=11):
    first_in = datetime(y, m, d, hour, 0, tzinfo=IST)
    last_out = datetime(y, m, d, 19, 0, tzinfo=IST)
    return [first_in, last_out]


def test_red_card_and_lop_only_apply_to_corporate_roster():
    # 5 late arrivals (all weekdays, none Sunday) within the Dec23-Jan22 cycle.
    late_days = [(2025, 12, 29), (2025, 12, 30), (2025, 12, 31), (2026, 1, 2), (2026, 1, 5)]
    punches = [p for day in late_days for p in _late_punch(*day)]

    corporate_summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, punches)
    assert corporate_summary["late_mark_count"] == 5
    assert corporate_summary["red_card"] is True
    # v1.1 §4: first 2 late marks are free; the 3rd, 4th and 5th are each a
    # ½-day LOP -> 3 x 0.5 = 1.5.
    assert corporate_summary["lop_days"] == 1.5

    factory_summary = compute_monthly_summary(EMPLOYEE, 2026, 1, punches)
    assert factory_summary["late_mark_count"] == 0
    assert factory_summary["red_card"] is False
    assert factory_summary["lop_days"] == 0
    assert factory_summary["late_days"] == 5  # the plain "late" badge is unaffected either way


def test_red_card_does_not_convert_an_already_approved_leave_to_lop():
    # Same 5 late arrivals (Red Card), plus an approved Paid Leave day inside
    # the same cycle. Approving the leave is itself the exception-granting
    # step — Red Card must not silently turn it into unpaid LOP behind HR's
    # back (regression for the Rushikesh Chande case, 2026-07).
    late_days = [(2025, 12, 29), (2025, 12, 30), (2025, 12, 31), (2026, 1, 2), (2026, 1, 5)]
    punches = [p for day in late_days for p in _late_punch(*day)]
    leaves = {date(2026, 1, 8): "paid"}

    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, punches, leaves=leaves)
    assert summary["red_card"] is True
    leave_row = next(r for r in summary["daily"] if r["date"] == "2026-01-08")
    assert leave_row["status"] == "leave"
    assert not leave_row.get("red_card_lop")
    assert summary["pl_days"] == 1  # counted as paid leave, not LOP


def test_wfh_day_pays_half_and_is_never_late_or_absent():
    # Policy v3 doc §25: an approved+completion-confirmed WFH day is paid
    # 50%, the same fractional treatment as an existing half_day status, and
    # must never be flagged late/absent/LOP — regardless of whether the
    # employee also happened to badge in that day (the approved+confirmed
    # WFH record is authoritative, per compute_daily_attendance's docstring).
    wfh_days = {date(2026, 1, 5): {"id": "req-1", "pay_treatment_percent": 50.0}}
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, [], wfh_days=wfh_days)
    wfh_row = next(r for r in summary["daily"] if r["date"] == "2026-01-05")
    assert wfh_row["status"] == "wfh"
    assert wfh_row["late"] is False
    assert "lop_days" not in wfh_row
    assert summary["wfh_days"] == 1
    assert summary["late_mark_count"] == 0
    assert summary["red_card"] is False
    # 31-day Jan 2026 cycle, 1 WFH day at 0.5, no other present/paid days:
    # only weekoffs/holidays plus the 0.5 WFH contribute to paid_days.
    baseline = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, [])
    assert round(summary["paid_days"] - baseline["paid_days"], 2) == 0.5
    assert round(baseline["without_pay_days"] - summary["without_pay_days"], 2) == 0.5


def test_wfh_absent_zero_impact_when_no_wfh_days_passed():
    # Safety proof for the default (wfh_days=None) path used by every
    # production call site today, since no real hr_wfh_requests rows exist
    # yet — must be byte-identical to pre-WFH behavior.
    punches = [p for day in [(2025, 12, 29), (2026, 1, 5)] for p in _late_punch(*day)]
    before = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, punches)
    after = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, punches, wfh_days=None)
    before.pop("daily")
    after.pop("daily")
    assert before == after
    assert before["wfh_days"] == 0


def test_worked_example_two_free_then_half_day_each():
    # v1.1 §4 worked example: 30 total days in the cycle, 5 late marks ->
    # 2 free + 3 penalized at ½ day each = 1.5 LOP, i.e. paid for 28.5 days.
    late_days = [(2025, 12, 29), (2025, 12, 30), (2025, 12, 31), (2026, 1, 2), (2026, 1, 5)]
    punches = [p for day in late_days for p in _late_punch(*day)]
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, punches)
    assert summary["lop_days"] == 1.5


def test_after_noon_arrival_is_half_day_lop_regardless_of_count():
    # v1.1 §4: arrival after 12:00 PM is a ½-day LOP regardless of the
    # late-mark count — even a lone after-noon arrival (1st late mark) is
    # NOT free.
    punches = [datetime(2026, 1, 5, 12, 0, 1, tzinfo=IST), datetime(2026, 1, 5, 19, 0, tzinfo=IST)]
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, punches)
    assert summary["late_mark_count"] == 1
    assert summary["lop_days"] == 0.5  # after-noon -> ½ day even within the free allowance


def test_late_arrival_with_short_hours_has_no_special_penalty():
    # v1.1 has no hours-shortfall late rule. Arriving late (1st late mark) and
    # leaving early — short of the 8h standard — is still free within the
    # 2-mark allowance; only after-noon or the 3rd+ late mark is charged.
    punches = [datetime(2026, 1, 5, 11, 0, tzinfo=IST), datetime(2026, 1, 5, 17, 0, tzinfo=IST)]  # 6h worked
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, punches)
    assert summary["late_mark_count"] == 1
    assert summary["lop_days"] == 0


def test_saturday_ot_is_calculated_only_after_3pm():
    # 2026-01-03 is a Saturday. Company-wide Jul 2026 policy: every
    # employee's Saturday standard time runs until 3:00 PM IST — only hours
    # actually worked past that clock time count as OT — regardless of
    # time_slot, and regardless of what time they arrived.
    punch_in = datetime(2026, 1, 3, 10, 0, tzinfo=IST)
    punch_out = datetime(2026, 1, 3, 16, 0, tzinfo=IST)  # 6h worked, 1h past 3pm

    rows = compute_daily_attendance(2026, 1, [punch_in, punch_out], 8, weekly_off_day=6)
    row = next(r for r in rows if r["date"] == "2026-01-03")
    assert row["hours_worked"] == 6.0
    assert row["ot_hours"] == 1.0  # 4pm - 3pm cutoff

    # The old shortened-Saturday time_slot behaves identically now — the
    # 5h day_standard it still carries only matters for the late-coming
    # policy's shortfall check, not for OT.
    rows_slot = compute_daily_attendance(
        2026, 1, [punch_in, punch_out], 8, weekly_off_day=6, time_slot="10:00 AM – 6:30 PM",
    )
    row_slot = next(r for r in rows_slot if r["date"] == "2026-01-03")
    assert row_slot["ot_hours"] == 1.0

    # A late arrival who still works past 3pm earns OT for that portion —
    # unlike the old hours-worked-minus-standard formula, arrival time
    # doesn't reduce it.
    late_in = datetime(2026, 1, 3, 13, 0, tzinfo=IST)
    rows_late = compute_daily_attendance(2026, 1, [late_in, punch_out], 8, weekly_off_day=6)
    row_late = next(r for r in rows_late if r["date"] == "2026-01-03")
    assert row_late["hours_worked"] == 3.0
    assert row_late["ot_hours"] == 1.0  # 4pm - 3pm cutoff, unaffected by the 1pm arrival

    # Leaving before 3pm earns no OT no matter how early they arrived.
    early_in = datetime(2026, 1, 3, 8, 0, tzinfo=IST)
    early_out = datetime(2026, 1, 3, 14, 0, tzinfo=IST)
    rows_early = compute_daily_attendance(2026, 1, [early_in, early_out], 8, weekly_off_day=6)
    row_early = next(r for r in rows_early if r["date"] == "2026-01-03")
    assert row_early["ot_hours"] == 0.0

    # Weekdays are unaffected — still hours-worked-beyond-standard.
    weekday_rows = compute_daily_attendance(
        2026, 1, [datetime(2026, 1, 5, 9, 0, tzinfo=IST), datetime(2026, 1, 5, 19, 0, tzinfo=IST)], 8, weekly_off_day=6,
    )
    weekday_row = next(r for r in weekday_rows if r["date"] == "2026-01-05")
    assert weekday_row["ot_hours"] == 2.0  # 10h worked - 8h standard


def test_closed_holiday_is_paid_for_corporate_only():
    holidays = [{"holiday_date": "2026-01-01", "day_type": "closed", "description": "New Year's Day", "location": None}]

    corporate_summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, [], holidays=holidays)
    corporate_jan1 = next(r for r in corporate_summary["daily"] if r["date"] == "2026-01-01")
    assert corporate_jan1["status"] == "holiday"

    factory_summary = compute_monthly_summary(EMPLOYEE, 2026, 1, [], holidays=holidays)
    factory_jan1 = next(r for r in factory_summary["daily"] if r["date"] == "2026-01-01")
    assert factory_jan1["status"] == "absent"  # Jan 1 2026 is a Thursday, not their Sunday weekoff


def test_day_off_holiday_is_paid_same_as_closed():
    holidays = [{"holiday_date": "2026-01-01", "day_type": "day_off", "description": "Extra day off", "location": None}]

    corporate_summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, [], holidays=holidays)
    corporate_jan1 = next(r for r in corporate_summary["daily"] if r["date"] == "2026-01-01")
    assert corporate_jan1["status"] == "holiday"

    factory_summary = compute_monthly_summary(EMPLOYEE, 2026, 1, [], holidays=holidays)
    factory_jan1 = next(r for r in factory_summary["daily"] if r["date"] == "2026-01-01")
    assert factory_jan1["status"] == "absent"  # day_off, like closed, is corporate-roster only


def test_holiday_location_only_applies_to_matching_employees():
    # CORPORATE_EMPLOYEE is at "Madhu Estate, Mumbai" — a Delhi-only holiday
    # must not apply to them, but a "Mumbai" or "HQ" one must.
    delhi_only = [{"holiday_date": "2026-01-01", "day_type": "closed", "description": "Delhi holiday", "location": "Delhi"}]
    not_applied = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, [], holidays=delhi_only)
    jan1 = next(r for r in not_applied["daily"] if r["date"] == "2026-01-01")
    assert jan1["status"] == "absent"

    for location in ("Mumbai", "HQ"):
        holidays = [{"holiday_date": "2026-01-01", "day_type": "closed", "description": "test", "location": location}]
        summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, [], holidays=holidays)
        jan1 = next(r for r in summary["daily"] if r["date"] == "2026-01-01")
        assert jan1["status"] == "holiday", f"expected location={location!r} to apply"


def test_anniversary_holiday_never_affects_attendance():
    holidays = [{"holiday_date": "2026-01-01", "day_type": "anniversary", "description": "JADE Anniversary", "location": None}]
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, [], holidays=holidays)
    jan1 = next(r for r in summary["daily"] if r["date"] == "2026-01-01")
    assert jan1["status"] == "absent"  # not "holiday" — anniversaries are informational only


def test_standard_working_days_per_month_overrides_the_per_day_rate_divisor():
    nimit = {**CORPORATE_EMPLOYEE, "standard_working_days_per_month": 20}
    summary = compute_monthly_summary(nimit, 2026, 1, [])
    assert summary["per_day_salary"] == 1340.0  # 26800 / 20, not / 31


# ── Late-coming policy v2, w.e.f. 22 Sept 2026 ──────────────────────────────
# Cycle Oct-2026 = 23 Sept - 22 Oct 2026, entirely on/after the effective date,
# so both the per-day rules (grace, tier) and the per-cycle rules (allowance,
# card thresholds) are v2. Cycle Sept-2026 = 23 Aug - 22 Sept is the
# transitional one: v2 counters, but each day priced on its own generation.

def _punch_at(y, m, d, hour, minute=0, second=0, out_hour=19):
    return [
        datetime(y, m, d, hour, minute, second, tzinfo=IST),
        datetime(y, m, d, out_hour, 0, tzinfo=IST),
    ]


def test_v2_grace_runs_to_1020_not_1011():
    # 10:20:00 exactly is on time from 22 Sept 2026; a second later is late.
    on_time = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 10, _punch_at(2026, 9, 23, 10, 20, 0))
    late = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 10, _punch_at(2026, 9, 23, 10, 20, 1))
    assert on_time["late_mark_count"] == 0
    assert late["late_mark_count"] == 1
    # 10:15 was late under v1.1's 10:11 grace — now inside the window.
    assert compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 10, _punch_at(2026, 9, 24, 10, 15))["late_days"] == 0


def test_v2_first_three_lates_are_a_yellow_card_with_no_deduction():
    late_days = [(2026, 9, 23), (2026, 9, 24), (2026, 9, 25)]
    punches = [p for day in late_days for p in _punch_at(*day, 10, 30)]
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 10, punches)
    assert summary["late_mark_count"] == 3
    assert summary["lop_days"] == 0
    assert summary["late_card"] == "yellow"
    assert summary["yellow_card"] is True
    assert summary["red_card"] is False
    assert summary["late_policy_version"] == 2


def test_v2_fourth_late_is_quarter_day_and_triggers_the_red_card():
    late_days = [(2026, 9, 23), (2026, 9, 24), (2026, 9, 25), (2026, 9, 28)]
    punches = [p for day in late_days for p in _punch_at(*day, 10, 30)]
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 10, punches)
    assert summary["late_mark_count"] == 4
    assert summary["lop_days"] == 0.25  # only the 4th is chargeable, at ¼ day
    # "Red Card issued to individuals late beyond 3 times in a month."
    assert summary["red_card"] is True
    assert summary["late_card"] == "red"
    assert summary["yellow_card"] is False


def test_v2_chargeable_late_from_11am_is_half_a_day():
    # 3 free, then a 10:45 (¼) and two 11:00+ arrivals (½ each) = 1.25.
    punches = []
    for day in [(2026, 9, 23), (2026, 9, 24), (2026, 9, 25)]:
        punches += _punch_at(*day, 10, 30)
    punches += _punch_at(2026, 9, 28, 10, 45)
    punches += _punch_at(2026, 9, 29, 11, 0)      # boundary: 11:00 itself is ½
    punches += _punch_at(2026, 9, 30, 11, 45)
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 10, punches)
    assert summary["late_mark_count"] == 6
    assert summary["lop_days"] == 1.25


def test_v2_after_noon_arrival_inside_the_yellow_card_is_no_longer_charged():
    # Deliberate softening vs v1.1, which charged ½ day for an after-noon
    # arrival even on the 1st late mark: v2's Yellow Card covers the first 3
    # late arrivals unconditionally.
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 10, _punch_at(2026, 9, 23, 13, 0))
    assert summary["late_mark_count"] == 1
    assert summary["lop_days"] == 0
    assert summary["late_card"] == "yellow"


def test_transitional_cycle_prices_each_day_on_its_own_generation():
    # 23 Aug - 22 Sept 2026. Cycle-level counters are v2 (3 free), but the
    # 4th late mark falls on a pre-22-Sept day, so it prices at v1.1's flat
    # ½ day rather than v2's ¼.
    late_days = [(2026, 9, 1), (2026, 9, 2), (2026, 9, 3), (2026, 9, 4)]
    punches = [p for day in late_days for p in _punch_at(*day, 10, 30)]
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 9, punches)
    assert summary["late_mark_count"] == 4
    assert summary["lop_days"] == 0.5
    assert summary["red_card"] is True


def test_transitional_cycle_switches_grace_on_the_effective_date():
    # Same 10:15 arrival: late on 21 Sept (v1.1's 10:11 grace), on time on
    # 22 Sept (v2's 10:20) — both inside the one Sept-2026 cycle.
    punches = _punch_at(2026, 9, 21, 10, 15) + _punch_at(2026, 9, 22, 10, 15)
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 9, punches)
    assert summary["late_mark_count"] == 1
    assert summary["lop_days"] == 0
    rows = {r["date"]: r for r in summary["daily"]}
    assert rows["2026-09-21"]["late"] is True
    assert rows["2026-09-22"]["late"] is False


def test_pre_effective_cycles_are_untouched_by_the_revision():
    # A July-2026 cycle must still grade on v1.1 exactly as before: 10:15 is
    # late, 2 free marks, flat ½ day, no Yellow Card, Red Card only at 5.
    late_days = [(2026, 6, 23), (2026, 6, 24), (2026, 6, 25), (2026, 6, 26)]
    punches = [p for day in late_days for p in _punch_at(*day, 10, 15)]
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 7, punches)
    assert summary["late_mark_count"] == 4
    assert summary["lop_days"] == 1.0  # 2 free, 2 charged at ½
    assert summary["red_card"] is False
    assert summary["late_card"] == "none"
    assert summary["late_policy_version"] == 1


def test_corrected_punch_is_tiered_on_arrival_time_like_a_raw_one():
    # An HR attendance override filling in an 11:30 arrival must reach v2's
    # ½-day tier, not the ¼-day one (the override path set neither tier flag
    # before this revision).
    overrides = {
        d: {"status_override": "present", "first_in": time(11, 30), "last_out": time(19, 0)}
        for d in [date(2026, 9, 23), date(2026, 9, 24), date(2026, 9, 25), date(2026, 9, 28)]
    }
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 10, [], overrides=overrides)
    assert summary["late_mark_count"] == 4
    assert summary["lop_days"] == 0.5


def test_late_policy_params_and_cards_switch_on_the_effective_date():
    assert LATE_POLICY_V2_EFFECTIVE == date(2026, 9, 22)
    assert late_policy_params(date(2026, 9, 21)) == {"free_count": 2, "red_card_at": 5}
    assert late_policy_params(date(2026, 9, 22)) == {"free_count": 3, "red_card_at": 4}
    assert [late_card_status(n, date(2026, 10, 22)) for n in range(5)] == [
        "none", "yellow", "yellow", "yellow", "red",
    ]
    # No Yellow Card is invented for cycles that closed before the revision.
    assert [late_card_status(n, date(2026, 7, 22)) for n in range(5)] == ["none"] * 5


def test_fy_quarters_map_pay_period_labels_apr_to_mar():
    assert fy_quarter_for_month(2026, 8) == ("2026-27", 2)
    assert fy_quarter_for_month(2026, 9) == ("2026-27", 2)
    assert fy_quarter_for_month(2027, 2) == ("2026-27", 4)
    assert quarter_month_labels("2026-27", 2) == [(2026, 7), (2026, 8), (2026, 9)]
    # Q4's Jan-Mar fall in the FY's second calendar year.
    assert quarter_month_labels("2026-27", 4) == [(2027, 1), (2027, 2), (2027, 3)]
