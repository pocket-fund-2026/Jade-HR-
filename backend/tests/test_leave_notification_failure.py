"""A broken email must never fail or lose a leave request: the row is saved first."""
from datetime import date, timedelta

from routers import leave


class _Any:
    """Chainable stand-in for the supabase query builder; every call returns itself."""
    def __init__(self, data): self._data = data
    def __getattr__(self, name): return lambda *a, **k: self
    def execute(self): return type("R", (), {"data": self._data})()


class _DB:
    def table(self, name):
        return _Any([{"id": "req-1", "email": None, "first_name": "A", "last_name": "B"}])


def test_leave_request_is_saved_even_if_the_notification_raises(monkeypatch):
    monkeypatch.setattr(leave, "supabase", _DB())
    monkeypatch.setattr(leave, "maybe_single_data", lambda r: {})
    monkeypatch.setattr(leave, "find_recent_duplicate", lambda *a, **k: None)  # reads the real DB otherwise
    def boom(*a, **k): raise RuntimeError("smtp down")
    monkeypatch.setattr(leave.email_service, "notify_leave_submitted", boom)
    d = date.today() + timedelta(days=10)
    body = leave.LeaveRequestCreate(leave_type="unpaid", start_date=d, end_date=d, reason="trip")
    user = {"id": "u1", "first_name": "A", "last_name": "B", "role": "employee", "date_of_joining": "2020-01-01"}
    out = leave.create_leave_request(body, user=user)
    assert out["id"] == "req-1"
