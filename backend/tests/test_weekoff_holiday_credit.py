from datetime import date, timedelta

from payroll import _apply_weekly_off_earning_rule


def week(statuses, sunday=date(2026, 11, 15)):
    """statuses = the 6 days before the Sunday, oldest first; returns rows incl. the Sunday."""
    rows = [{"date": (sunday - timedelta(days=6 - i)).isoformat(), "status": s} for i, s in enumerate(statuses)]
    rows.append({"date": sunday.isoformat(), "status": "weekoff"})
    return rows


def test_dhananjay_diwali_week_sunday_stays_weekoff():
    # Mon/Tue Diwali holidays, Wed/Thu absent, Fri/Sat present
    rows = week(["holiday", "holiday", "absent", "absent", "present", "present"])
    _apply_weekly_off_earning_rule(rows)
    assert rows[-1]["status"] == "weekoff"


def test_two_present_and_no_holiday_is_still_forfeited():
    rows = week(["absent", "absent", "absent", "absent", "present", "present"])
    _apply_weekly_off_earning_rule(rows)
    assert rows[-1]["status"] == "absent" and rows[-1]["weekoff_forfeited"]


def test_one_holiday_one_present_not_enough():
    rows = week(["holiday", "absent", "absent", "absent", "present", "absent"])
    _apply_weekly_off_earning_rule(rows)
    assert rows[-1]["status"] == "absent"
