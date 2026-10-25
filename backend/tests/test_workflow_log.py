import logging

import workflow_log


class FakeTable:
    def __init__(self, store, fail=False):
        self.store, self.fail = store, fail

    def insert(self, row):
        self.row = row
        return self

    def execute(self):
        if self.fail:
            raise RuntimeError("db down")
        self.store.append(self.row)


class FakeDB:
    def __init__(self, fail=False):
        self.rows, self.fail = [], fail

    def table(self, name):
        assert name == "hr_workflow_events"
        return FakeTable(self.rows, self.fail)


def test_records_who_what_and_basis(monkeypatch):
    db = FakeDB()
    monkeypatch.setattr(workflow_log, "supabase", db)
    workflow_log.record_step("loan", 42, "approve", {"id": "u1", "role": "hr"}, employee_id="e1",
                             basis={"amount": 5000}, note="ok")
    assert db.rows == [{"workflow": "loan", "subject_id": "42", "employee_id": "e1", "action": "approve",
                        "actor_id": "u1", "actor_role": "hr", "basis": {"amount": 5000}, "note": "ok"}]


def test_a_failed_write_never_breaks_the_approval(monkeypatch, caplog):
    monkeypatch.setattr(workflow_log, "supabase", FakeDB(fail=True))
    with caplog.at_level(logging.ERROR, logger="jade_hr.workflow_log"):
        workflow_log.record_step("leave", "x", "approve", {"id": "u1", "role": "employee"})  # must not raise
    assert "workflow log write failed" in caplog.text


def test_system_actor_and_note_cap(monkeypatch):
    db = FakeDB()
    monkeypatch.setattr(workflow_log, "supabase", db)
    workflow_log.record_step("exit", "x", "finalized", None, note="n" * 900)
    assert db.rows[0]["actor_role"] == "system" and len(db.rows[0]["note"]) == 500


def test_every_hooked_workflow_has_a_label():
    for key in ("leave", "comp_off", "payslip_approval", "loan", "onboarding", "exit", "aip"):
        assert key in workflow_log.WORKFLOWS


def test_loan_approval_writes_a_log_row_through_the_real_endpoint(monkeypatch):
    from types import SimpleNamespace

    from routers import loans

    events = []

    class Q:
        def __init__(self, table):
            self.table_name, self.op = table, None

        def select(self, *_): self.op = "select"; return self
        def update(self, _): self.op = "update"; return self
        def insert(self, row): self.op, self.row = "insert", row; return self
        def eq(self, *_): return self
        def maybe_single(self): return self

        def execute(self):
            if self.op == "insert":
                events.append(self.row)
                return SimpleNamespace(data=[self.row])
            if self.op == "select":
                return SimpleNamespace(data={"id": "L1", "status": "pending", "employee_id": "e1",
                                             "amount": 9000, "first_name": "A", "last_name": "B", "email": ""})
            return SimpleNamespace(data=[])

    db = SimpleNamespace(table=lambda name: Q(name))
    monkeypatch.setattr(loans, "supabase", db)
    monkeypatch.setattr(workflow_log, "supabase", db)
    monkeypatch.setattr(loans.email_service, "notify_loan_resolved", lambda *a, **k: None)

    out = loans.resolve_loan_request("L1", loans.LoanResolve(action="approve", admin_note="fine"), {"id": "hr1", "role": "hr"})
    assert out == {"ok": True}
    assert events == [{"workflow": "loan", "subject_id": "L1", "employee_id": "e1", "action": "approve",
                       "actor_id": "hr1", "actor_role": "hr", "basis": {"amount": 9000}, "note": "fine"}]


class RecordingDB:
    """Minimal supabase stand-in: selects return per-table canned data, writes
    succeed with an id, and every hr_workflow_events insert is captured."""

    def __init__(self, selects):
        from types import SimpleNamespace

        self.selects, self.events, self.ns = selects, [], SimpleNamespace

    def table(self, name):
        db = self

        class Q:
            op = None

            def select(self, *_): self.op = "select"; return self
            def update(self, _): self.op = "write"; return self
            def upsert(self, *_, **__): self.op = "write"; return self
            def delete(self): self.op = "write"; return self
            def insert(self, row): self.op, self.row = "insert", row; return self
            def eq(self, *_): return self
            def maybe_single(self): return self

            def execute(self):
                if self.op == "insert":
                    if name == "hr_workflow_events":
                        db.events.append(self.row)
                    return db.ns(data=[{**self.row, "id": f"{name}-1"}])
                if self.op == "select":
                    return db.ns(data=db.selects.get(name, []))
                return db.ns(data=[{"id": f"{name}-1"}])

        return Q()


def test_dispute_settlement_logs_the_actual_role_that_settled_it(monkeypatch):
    from datetime import date

    from routers import disputes

    dispute = {"id": "D1", "employee_id": "e1", "date": "2026-10-20", "issue_type": "missed_clock_in",
               "reason": "forgot", "claimed_in": None, "claimed_out": None, "status": "pending"}
    db = RecordingDB({"hr_attendance_disputes": dispute})
    monkeypatch.setattr(disputes, "supabase", db)
    monkeypatch.setattr(workflow_log, "supabase", db)
    body = disputes.DisputeResolve(action="reject", admin_note="no proof")
    disputes._settle("D1", body, {"id": "mgr1", "role": "employee"}, "manager", {"e1"})
    ev = db.events[0]
    assert (ev["workflow"], ev["action"], ev["actor_role"], ev["employee_id"]) == ("dispute", "reject", "manager", "e1")
    assert ev["basis"]["date"] == "2026-10-20" and ev["note"] == "no proof"


def test_wfh_resolution_is_logged(monkeypatch):
    from routers import wfh

    db = RecordingDB({"hr_wfh_requests": {"id": "W1", "status": "pending", "employee_id": "e9"}})
    monkeypatch.setattr(wfh, "supabase", db)
    monkeypatch.setattr(workflow_log, "supabase", db)
    wfh.resolve_wfh_request("W1", wfh.WFHResolve(action="approve", note="ok"), {"id": "h1", "role": "hr"})
    ev = db.events[0]
    assert (ev["workflow"], ev["action"], ev["employee_id"], ev["actor_id"]) == ("wfh", "approve", "e9", "h1")


def test_quarter_red_card_application_is_logged_with_its_basis(monkeypatch):
    from datetime import date

    from routers import late_policy

    db = RecordingDB({"hr_letter_templates": []})
    monkeypatch.setattr(late_policy, "supabase", db)
    monkeypatch.setattr(workflow_log, "supabase", db)
    row = {"employee_id": "e1", "name": "A B", "employee_code": "C1",
           "months": [{"label": "Oct 2026", "late_mark_count": 4, "in_policy": True}]}
    out = late_policy._forfeit_paid_leave(row, "2026-27", 3, date(2026, 12, 22), {"id": "h1", "role": "hr"})
    assert out["status"] == "applied"
    ev = db.events[0]
    assert (ev["workflow"], ev["action"], ev["employee_id"]) == ("quarter_red_card", "applied", "e1")
    assert ev["basis"]["pl_forfeited"] == late_policy.QUARTER_RED_CARD_PL_FORFEIT and ev["basis"]["letter_issued"] is False


def test_already_applied_quarter_card_is_not_logged_twice(monkeypatch):
    from datetime import date

    from routers import late_policy

    db = RecordingDB({})
    real_table = db.table

    def table(name):
        q = real_table(name)
        if name == "hr_late_policy_actions":
            q.insert = lambda row: (_ for _ in ()).throw(RuntimeError("unique violation"))
        return q

    db.table = table
    monkeypatch.setattr(late_policy, "supabase", db)
    monkeypatch.setattr(workflow_log, "supabase", db)
    row = {"employee_id": "e1", "name": "A", "employee_code": "C1", "months": []}
    out = late_policy._forfeit_paid_leave(row, "2026-27", 3, date(2026, 12, 22), {"id": "h1", "role": "hr"})
    assert out["status"] == "already_applied" and db.events == []
