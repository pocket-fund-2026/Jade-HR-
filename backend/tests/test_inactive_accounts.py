from datetime import datetime, timezone

import data_readiness as dr

NOW = datetime(2026, 11, 25, tzinfo=timezone.utc)


def emp(i, **kw):
    base = {"id": f"id{i}", "employee_code": str(i), "first_name": f"N{i}", "last_name": "X", "role": "employee", "is_active": True,
            "date_of_joining": None, "created_at": "2026-01-01T00:00:00+00:00", "basic": 0, "roster_unmatched_streak": 0,
            "password_changed_by_employee": False, "location": "HQ"}
    base.update(kw)
    return base


def reasons(emps, punched=(), managers=()):
    return {c["code"]: c["reason"] for c in dr.inactive_candidates(emps, set(punched), set(managers), NOW)}


def test_placeholder_and_stub_and_idle():
    emps = [emp(1, first_name="1", last_name="(auto-added from biometric)"),
            emp(2, first_name="Employee 2", last_name=""),
            emp(3)]
    assert reasons(emps) == {"1": "placeholder", "2": "stub", "3": "idle"}


def test_never_include_console_logins_or_paid_or_punching_or_managers():
    emps = [emp(1, role="accounts"), emp(2, role="hr"), emp(3, basic=25000), emp(4), emp(5)]
    assert reasons(emps, punched={"4"}, managers={"id5"}) == {}


def test_new_accounts_and_new_joiners_are_not_inactive():
    emps = [emp(1, created_at="2026-11-20T00:00:00+00:00"), emp(2, date_of_joining="2026-11-10"), emp(3, date_of_joining="2027-01-05")]
    assert reasons(emps) == {}


def test_roster_missing_needs_streak_and_a_logged_in_person_is_kept_otherwise():
    emps = [emp(1, roster_unmatched_streak=3, password_changed_by_employee=True),
            emp(2, roster_unmatched_streak=1, password_changed_by_employee=True)]
    assert reasons(emps) == {"1": "not_in_roster"}


def test_already_inactive_ignored():
    assert reasons([emp(1, is_active=False)]) == {}
