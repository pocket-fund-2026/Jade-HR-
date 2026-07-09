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
    # Exactly 10:10 IST counts as on time; a second later is late.
    on_time = datetime(2026, 1, 5, 10, 10, 0, tzinfo=IST)
    late = datetime(2026, 1, 5, 10, 10, 1, tzinfo=IST)
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
    assert summary["per_day_salary"] == 864.52  # 26800 / 31
    assert summary["per_hour_salary"] == 108.06  # per_day_salary / 8
    assert summary["ot_amount"] == 216.13  # unrounded per_hour_salary * 2h, then rounded
    assert summary["gross_salary"] == 26800.0
    assert summary["total_payable"] == 27016.13
