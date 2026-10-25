from datetime import date, datetime, timedelta, timezone

import data_readiness as dr
import payroll


def emp(i, **kw):
    base = {"id": f"e{i}", "employee_code": f"C{i}", "first_name": "A", "last_name": str(i),
            "email": f"a{i}@x.com", "phone": f"90000000{i:02d}", "date_of_joining": "2024-01-01",
            "basic": 20000, "leave_approver_id": "m1"}
    base.update(kw)
    return base


GOOD_PROFILE = {"time_slot": "10:00 AM – 7:00 PM", "date_of_birth": "1990-01-01", "pan_no": "ABCDE1234F",
                "aadhar_no": "111122223333", "bank_account_no": "123", "bank_ifsc": "HDFC0000001"}


def by_key(checks):
    return {c["key"]: c for c in checks}


def test_blank_time_slot_is_a_blocker_but_flexible_is_not():
    emps = [emp(1), emp(2), emp(3)]
    profiles = {
        "e1": {**GOOD_PROFILE, "time_slot": ""},
        "e2": {**GOOD_PROFILE, "time_slot": payroll.FLEXIBLE_TIME_SLOT},
        "e3": GOOD_PROFILE,
    }
    c = by_key(dr.quality_checks(emps, profiles))["blank_time_slot"]
    assert c["count"] == 1 and c["severity"] == dr.WARN and c["sample"] == ["A 1 (C1)"]


def test_unrecognised_slot_flagged_separately():
    profiles = {"e1": {**GOOD_PROFILE, "time_slot": "9:30 AM – 6 PM"}}
    c = by_key(dr.quality_checks([emp(1)], profiles))
    assert c["unknown_time_slot"]["count"] == 1 and c["blank_time_slot"]["count"] == 0


def test_clean_data_is_ready():
    checks = dr.quality_checks([emp(1)], {"e1": GOOD_PROFILE}) + dr.duplicate_checks([emp(1)], {"e1": GOOD_PROFILE})
    assert dr.overall_decision(checks) == "ready"
    assert all(c["control"] == "" for c in checks)


def test_no_salary_figures_flagged_only_when_every_component_is_zero():
    zero = {k: 0 for k in dr.SALARY_FIELDS}
    emps = [emp(1, **zero), emp(2, **{**zero, "other_allowance": 500}), emp(3)]
    c = by_key(dr.quality_checks(emps, {}))["no_salary_figures"]
    assert c["count"] == 1 and c["sample"] == ["A 1 (C1)"]


def test_warn_gives_controls_and_block_wins():
    warn = dr.quality_checks([emp(1, email="")], {"e1": GOOD_PROFILE})
    assert dr.overall_decision(warn) == "ready_with_controls"
    assert by_key(warn)["no_email"]["control"]
    blocked = [dr.feed_status("x", "HR", 6, None, datetime.now(timezone.utc), "")]
    assert dr.overall_decision(warn + blocked) == "not_ready"


def test_duplicates_normalise_formatting():
    emps = [emp(1, phone="90000 00001"), emp(2, phone="9000000001"), emp(3)]
    c = by_key(dr.duplicate_checks(emps, {}))["dup_phone"]
    assert c["count"] == 2


def test_feed_freshness_states():
    now = datetime(2026, 10, 25, 12, tzinfo=timezone.utc)
    f = lambda hrs: dr.feed_status("x", "HR", 6, (now - timedelta(hours=hrs)).isoformat(), now, "")["status"]
    assert (f(1), f(8), f(13)) == ("fresh", "late", "stale")
    assert dr.feed_status("x", "HR", 6, None, now, "")["status"] == "never_run"


def test_partial_register_is_surfaced_not_silent():
    start, end = date(2026, 9, 23), date(2026, 9, 25)  # 3-day period
    emps = [emp(1), emp(2), emp(3)]
    rows = [{"employee_id": "e1", "date": f"2026-09-{d}"} for d in (23, 24, 25)] + [
        {"employee_id": "e2", "date": "2026-09-23"}]
    r = dr.register_coverage(rows, emps, start, end)
    assert (r["on_register"], r["on_engine"], r["partial"]["count"]) == (1, 1, 1)


def test_access_check_flags_console_logins_on_assigned_passwords():
    allemps = [
        {**emp(1), "role": "hr", "is_active": True, "password_changed_by_employee": False},
        {**emp(2), "role": "hr", "is_active": True, "password_changed_by_employee": True},
        {**emp(3), "role": "employee", "is_active": True, "password_changed_by_employee": False},
    ]
    c = by_key(dr.access_checks(allemps, [{"permission_key": "a", "hr_can_access": True}]))
    assert c["console_default_password"]["count"] == 1 and c["console_default_password"]["total"] == 2


def test_definitions_are_read_from_the_engine_not_retyped():
    d = dr.policy_definitions()
    v3 = next(p for p in d["policies"] if p["version"].startswith("v3"))
    assert v3["effective_from"] == payroll.LATE_POLICY_V3_EFFECTIVE.isoformat()
    assert v3["yellow_cards_for_red"] == payroll.V3_YELLOW_CARDS_FOR_RED
    assert v3["status"] == "in force" and payroll.late_policy_v3_active(date.today())


def test_leave_definitions_come_from_the_leave_engine():
    from routers import leave

    d = dr.policy_definitions()["leave"]
    assert d["paid_leave_annual_days"] == leave.PAID_LEAVE_ANNUAL_CAP
    assert d["comp_off_validity_days"] == leave.COMP_OFF_VALIDITY_DAYS
    assert "comp_off" in d["blocked_during_red_card"]
