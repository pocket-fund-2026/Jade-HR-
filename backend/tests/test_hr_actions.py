from datetime import date

from routers import hr_actions as h

T = date(2026, 11, 26)


def test_aip_flagged_recommends_failed_even_before_end():
    r = {"end_date": "2026-12-20", "notes": "x [AUTO-FLAG] 2 late"}
    assert h.aip_recommendation(r, T)["action"] == "close_failed"


def test_aip_ended_clean_needs_no_human_it_auto_closes():
    assert h.aip_recommendation({"end_date": "2026-11-20", "notes": ""}, T) is None


def test_escalation_fires_once_per_threshold():
    assert [d for d in range(0, 20) if h.escalation_due(d)] == [5, 8, 12]


def test_aip_running_needs_no_decision():
    assert h.aip_recommendation({"end_date": "2026-12-20", "notes": ""}, T) is None


class _Any:
    def __init__(self, d): self._d = d
    def __getattr__(self, n): return lambda *a, **k: self
    def execute(self): return type("R", (), {"data": self._d})()


class _DB:
    def __init__(self, tables): self.t = tables
    def table(self, n): return _Any(self.t.get(n, []))


def test_collect_lists_only_stuck_items_and_render_never_claims_action(monkeypatch):
    emp = {"first_name": "A", "last_name": "B", "employee_code": "1"}
    monkeypatch.setattr(h, "supabase", _DB({
        "hr_leave_requests": [
            {"id": "old", "status": "pending", "created_at": "2026-11-10", "start_date": "2026-12-01", "end_date": "2026-12-01", "hr_employees": emp},
            {"id": "fresh", "status": "pending", "created_at": "2026-11-25", "start_date": "2026-12-01", "end_date": "2026-12-01", "hr_employees": emp}],
        "hr_attendance_disputes": [{"id": "d", "created_at": "2026-11-25", "date": "2026-11-24", "hr_employees": emp}],
        "hr_aip_records": [{"id": "a", "end_date": "2026-12-20", "notes": "x [AUTO-FLAG] 2 late", "hr_employees": emp}],
    }))
    d = h.collect(T)
    assert [x["id"] for x in d["items"]["leave"]] == ["old"] and d["items"]["disputes"] == []
    assert d["items"]["aip"][0]["action"] == "close_failed" and d["total"] == 2
    assert "Nothing has been approved" in h.render(d)


def test_escalation_goes_to_approvers_manager_and_skips_dry_run_sends(monkeypatch):
    emp = {"first_name": "A", "last_name": "B", "employee_code": "1", "leave_approver_id": "mgr"}
    tables = {
        "hr_leave_requests": [{"id": "r", "employee_id": "e", "created_at": "2026-11-21", "start_date": "2026-12-02", "end_date": "2026-12-02", "status": "pending", "hr_employees": emp}],
        "hr_employee_profile": [{"employee_id": "e", "reporting_to_id": "mgr"}, {"employee_id": "mgr", "reporting_to_id": "boss"}],
        "hr_employees": [{"id": "mgr", "first_name": "M", "last_name": "G", "email": "m@x.com", "is_active": True},
                         {"id": "boss", "first_name": "B", "last_name": "S", "email": "boss@x.com", "is_active": True}],
    }
    monkeypatch.setattr(h, "supabase", _DB(tables))
    sent = []
    monkeypatch.setattr(h.email_service, "send_email_detailed", lambda *a, **k: sent.append(a) or (True, None))
    out = h.escalate_leave(T, dry_run=True)
    assert out and out[0]["requests"] == 1 and sent == []
    h.escalate_leave(T, dry_run=False)
    assert len(sent) == 1
