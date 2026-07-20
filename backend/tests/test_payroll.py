from datetime import date, datetime, time, timezone

from config import IST
from payroll import (
    compute_daily_attendance,
    compute_monthly_summary,
    days_in_month,
    group_punches_by_day,
    pay_period_bounds,
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


def test_absent_day_on_weekly_off_is_marked_weekoff():
    # 2026-01-04 is a Sunday. No punches, no leave, no override -> weekoff,
    # not absent, when weekly_off_day=6.
    rows = compute_daily_attendance(2026, 1, [], 8, weekly_off_day=6)
    sunday_row = next(r for r in rows if r["date"] == "2026-01-04")
    assert sunday_row["status"] == "weekoff"

    # A non-Sunday day with no punches falls back to absent.
    monday_row = next(r for r in rows if r["date"] == "2025-12-29")
    assert monday_row["status"] == "absent"


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
    # Single 10-hour day (2h OT) in an otherwise-empty 31-day period, so
    # total_ot_hours is pinned to exactly 2.0 and every downstream figure
    # is fully deterministic — same formula as the Sarita example in this
    # module's docstring.
    punch_in = datetime(2026, 1, 5, 9, 0, tzinfo=IST)
    punch_out = datetime(2026, 1, 5, 19, 0, tzinfo=IST)

    summary = compute_monthly_summary(EMPLOYEE, 2026, 1, [punch_in, punch_out])

    assert summary["days_in_month"] == 31
    assert summary["total_ot_hours"] == 2.0
    # OT's per-day/per-hour divisor always uses the full monthly rate
    # (26,800 = 16,000 + 9,600 + 1,200), never the prorated actual below.
    assert summary["per_day_salary"] == 864.52  # 26800 / 31
    assert summary["per_hour_salary"] == 108.06  # per_day_salary / 8
    assert summary["ot_amount"] == 216.13  # unrounded per_hour_salary * 2h, then rounded
    # Only 1 present day + 4 weekoffs in this otherwise-empty period ->
    # paid_days = 5, so Basic/HRA/Conveyance are prorated to 5/31 of rate.
    assert summary["paid_days"] == 5.0
    assert summary["basic"] == 2580.65  # 16000 * 5/31
    assert summary["gross_salary"] == 4322.59  # 2580.65 + 1548.39 + 193.55
    assert summary["total_payable"] == 4538.72  # gross_salary + ot_amount (no deductions apply)


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
    # First 3 late marks are free (full daily hours were still completed
    # each time); the 4th and 5th are each 1/2 day LOP.
    assert corporate_summary["lop_half_days"] == 2

    factory_summary = compute_monthly_summary(EMPLOYEE, 2026, 1, punches)
    assert factory_summary["late_mark_count"] == 0
    assert factory_summary["red_card"] is False
    assert factory_summary["lop_half_days"] == 0
    assert factory_summary["late_days"] == 5  # the plain "late" badge is unaffected either way


def test_after_noon_arrival_is_lop_regardless_of_late_mark_count():
    punches = [datetime(2026, 1, 5, 12, 0, 1, tzinfo=IST), datetime(2026, 1, 5, 19, 0, tzinfo=IST)]
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, punches)
    assert summary["late_mark_count"] == 1
    assert summary["lop_half_days"] == 1  # would normally be free (1st late mark) but after-noon overrides that


def test_late_arrival_without_completed_daily_hours_is_not_free():
    # Arrives late (1st late mark, normally free within the 3-mark
    # allowance) but leaves early, falling short of the 8h standard for
    # that day -> LOP anyway, since the allowance is conditional on
    # completing the prescribed daily working hours.
    punches = [datetime(2026, 1, 5, 11, 0, tzinfo=IST), datetime(2026, 1, 5, 17, 0, tzinfo=IST)]  # 6h worked
    summary = compute_monthly_summary(CORPORATE_EMPLOYEE, 2026, 1, punches)
    assert summary["late_mark_count"] == 1
    assert summary["lop_half_days"] == 1


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
