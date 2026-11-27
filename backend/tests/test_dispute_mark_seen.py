"""Dispute decisions are shown to the employee once: the dashboard marks them seen.

Before this, nothing set seen_by_employee on hr_attendance_disputes, so every
past decision came back in the dashboard's update banner on every visit.
"""
from routers import disputes


class _Query:
    def __init__(self, log, rows):
        self.log, self.rows = log, rows

    def update(self, values):
        self.log.append(("update", values))
        return self

    def eq(self, col, val):
        self.log.append(("eq", col, val))
        return self

    def neq(self, col, val):
        self.log.append(("neq", col, val))
        return self

    def in_(self, col, vals):
        self.log.append(("in", col, list(vals)))
        return self

    def execute(self):
        return type("R", (), {"data": self.rows})()


class _DB:
    def __init__(self, rows):
        self.log, self.rows, self.tables = [], rows, []

    def table(self, name):
        self.tables.append(name)
        return _Query(self.log, self.rows)


def test_marks_only_the_callers_resolved_disputes(monkeypatch):
    db = _DB([{"id": "d1"}, {"id": "d2"}])
    monkeypatch.setattr(disputes, "supabase", db)
    out = disputes.mark_my_disputes_seen(disputes.SeenBody(ids=["d1", "d2", ""]), user={"id": "emp-1"})
    assert out == {"updated": 2}
    assert db.tables == ["hr_attendance_disputes"]
    assert ("update", {"seen_by_employee": True}) in db.log
    # scoped to the caller and never touches a still-pending dispute
    assert ("eq", "employee_id", "emp-1") in db.log
    assert ("neq", "status", "pending") in db.log
    assert ("in", "id", ["d1", "d2"]) in db.log


def test_empty_list_does_not_query(monkeypatch):
    db = _DB([])
    monkeypatch.setattr(disputes, "supabase", db)
    assert disputes.mark_my_disputes_seen(disputes.SeenBody(ids=[]), user={"id": "emp-1"}) == {"updated": 0}
    assert db.tables == []


def test_route_is_registered():
    paths = {(r.path, tuple(sorted(r.methods))) for r in disputes.router.routes}
    assert ("/api/me/disputes/mark-seen", ("POST",)) in paths
