from datetime import date, timedelta

import pytest
from fastapi import HTTPException

from routers import confirmations


class _Q:
    def __init__(self, rows): self.rows = rows
    def select(self, *a, **k): return self
    def eq(self, *a, **k): return self
    def execute(self): return type("R", (), {"data": self.rows})()
    def upsert(self, row, **k):
        _Q.writes.append(row); return self
_Q.writes = []


class _DB:
    def __init__(self, emps, profiles): self.t = {"hr_employees": emps, "hr_employee_profile": profiles}
    def table(self, name): return _Q(self.t[name])


def _emp(i, days_ago):
    return {"id": i, "employee_code": i, "first_name": i, "last_name": "", "department": "d", "designation": "x",
            "location": "l", "is_active": True, "date_of_joining": (date.today() - timedelta(days=days_ago)).isoformat()}


@pytest.fixture
def db(monkeypatch):
    _Q.writes = []
    emps = [_emp("old", 800), _emp("new", 30), _emp("done", 800), _emp("left", 800), _emp("rec", 400)]
    profs = [
        {"employee_id": "done", "confirmation_date": "2025-01-01"},
        {"employee_id": "left", "employee_status": "On Notice"},
        {"employee_id": "rec", "probation_completion_date": "2025-12-01"},
    ]
    monkeypatch.setattr(confirmations, "supabase", _DB(emps, profs))


def test_only_long_tenured_unconfirmed_active_people_are_proposed(db):
    rows = {r["employee_id"]: r for r in confirmations._backfill_candidates(126)}
    assert set(rows) == {"old", "rec"}          # not new joiner, not already confirmed, not on notice
    assert rows["rec"]["proposed_confirmation_date"] == "2025-12-01"   # recorded end wins
    expected = (date.today() - timedelta(days=800) + timedelta(days=126)).isoformat()
    assert rows["old"]["proposed_confirmation_date"] == expected


def test_apply_recomputes_dates_server_side_and_rejects_ineligible(db):
    out = confirmations.backfill_apply(confirmations.BackfillApply(employee_ids=["old", "new"]), user={})
    assert out == {"confirmed": 1, "skipped": 1}
    assert [w["employee_id"] for w in _Q.writes] == ["old"]
    with pytest.raises(HTTPException):
        confirmations.backfill_apply(confirmations.BackfillApply(employee_ids=["new"]), user={})
