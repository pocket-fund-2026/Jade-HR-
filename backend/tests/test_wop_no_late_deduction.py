from payroll import apply_late_coming_policy, apply_late_coming_policy_v3


def _row(date, first_in_utc, **over):
    r = {"date": date, "status": "present", "first_in": f"{date}T{first_in_utc}+00:00", "late": True,
         "worked_on_weekly_off": False, "late_half_day_tier": False}
    r.update(over)
    return r


def test_v3_skips_worked_on_weekly_off():
    # 2026-10-25 is a Sunday; 05:30 UTC = 11:00 IST (would be Level 2 on a normal day)
    daily = [_row("2026-10-24", "05:30:00"), _row("2026-10-25", "05:30:00", worked_on_weekly_off=True)]
    apply_late_coming_policy_v3(daily, "10:00 AM – 7:00 PM")
    assert daily[0].get("lop_days")            # normal day is still graded
    assert "lop_days" not in daily[1] and "late_band_v3" not in daily[1]


def test_v2_ignores_non_late_wop_rows():
    daily = [_row("2026-10-25", "05:30:00", worked_on_weekly_off=True, late=False)]
    apply_late_coming_policy(daily, 8.0, "10:00 AM – 7:00 PM")
    assert "lop_days" not in daily[0]
