import pytest
from fastapi import HTTPException

from routers import exit_procedure as ep


class _Q:
    def __init__(self, db, name): self.db, self.name, self.filters = db, name, []
    def select(self, *_): return self
    def update(self, row): self.db.updates.append((self.name, row)); return self
    def in_(self, col, vals): self.filters.append((col, set(vals))); return self
    def eq(self, col, val): self.filters.append((col, {val})); return self
    def limit(self, *_): return self
    def execute(self):
        class R: pass
        r = R(); rows = self.db.tables.get(self.name, [])
        for col, vals in self.filters:
            rows = [x for x in rows if x.get(col) in vals]
        r.data = rows; return r


class _DB:
    def __init__(self, tables): self.tables, self.updates = tables, []
    def table(self, name): return _Q(self, name)


def _setup(monkeypatch, signers):
    db = _DB({
        "hr_exit_signers": signers,
        "hr_exit_records": [
            {"id": "X1", "employee_id": "L1", "last_working_day": "2026-12-01", "status": "in_progress"},
            {"id": "X2", "employee_id": "SIYAL", "last_working_day": "2026-12-05", "status": "in_progress"},
        ],
        "hr_exit_checklist_items": [
            {"id": "i1", "exit_id": "X1", "department": "Costing/Purchase", "item_label": "Jobber Bill", "status": "pending"},
            {"id": "i2", "exit_id": "X1", "department": "Accounts", "item_label": "Payment", "status": "pending"},
            {"id": "i3", "exit_id": "X1", "department": "Department Head", "item_label": "Handover", "status": "pending"},
            {"id": "i4", "exit_id": "X1", "department": "Costing/Purchase", "item_label": "Jobber Bill", "status": "completed"},
            {"id": "i5", "exit_id": "X1", "department": "IT (Rajendra Power)", "item_label": "x", "status": "pending"},
            {"id": "i6", "exit_id": "X2", "department": "Costing/Purchase", "item_label": "Jobber Bill", "status": "pending"},
        ],
        "hr_employees": [
            {"id": "L1", "employee_code": "1", "first_name": "Leaver", "last_name": "One", "department": "Sampling"},
            {"id": "SIYAL", "employee_code": "14463", "first_name": "Siyal", "last_name": "Jain", "department": "Costing"},
        ],
    })
    monkeypatch.setattr(ep, "supabase", db)
    monkeypatch.setattr(ep, "record_step", lambda *a, **k: None)
    return db


def test_only_named_rows_for_named_person_and_never_own_exit(monkeypatch):
    _setup(monkeypatch, [{"row_department": "Costing/Purchase", "employee_id": "SIYAL", "scope_department": None}])
    got = ep.pending_signoffs_for({"id": "SIYAL"})
    assert [g["item_id"] for g in got] == ["i1"]  # not i2 (Accounts), not i4 (done), not i5 (retired), not i6 (her own exit)


def test_department_head_row_needs_matching_scope(monkeypatch):
    _setup(monkeypatch, [{"row_department": "Department Head", "employee_id": "SIYAL", "scope_department": "Costing"}])
    assert ep.pending_signoffs_for({"id": "SIYAL"}) == []  # leaver is in Sampling
    _setup(monkeypatch, [{"row_department": "Department Head", "employee_id": "SIYAL", "scope_department": " sampling "}])
    assert [g["item_id"] for g in ep.pending_signoffs_for({"id": "SIYAL"})] == ["i3"]


def test_nobody_else_gets_a_popup(monkeypatch):
    _setup(monkeypatch, [{"row_department": "Costing/Purchase", "employee_id": "SIYAL", "scope_department": None}])
    assert ep.pending_signoffs_for({"id": "SOMEONE"}) == []


def test_sign_requires_exact_name_and_confirm(monkeypatch):
    db = _setup(monkeypatch, [{"row_department": "Costing/Purchase", "employee_id": "SIYAL", "scope_department": None}])
    user = {"id": "SIYAL", "first_name": "Siyal", "last_name": "Jain"}
    with pytest.raises(HTTPException) as e:
        ep.sign_my_signoff("i1", ep.ExitSignoff(typed_name="Siyal", confirm=True), user)
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:
        ep.sign_my_signoff("i1", ep.ExitSignoff(typed_name="Siyal Jain", confirm=False), user)
    assert e.value.status_code == 400
    with pytest.raises(HTTPException) as e:  # a row that is not hers
        ep.sign_my_signoff("i2", ep.ExitSignoff(typed_name="Siyal Jain", confirm=True), user)
    assert e.value.status_code == 403
    assert ep.sign_my_signoff("i1", ep.ExitSignoff(typed_name="  siyal   JAIN ", confirm=True), user) == {"ok": True}
    row = [u for n, u in db.updates if n == "hr_exit_checklist_items"][0]
    assert row["status"] == "completed" and row["signed_by"] == "Siyal Jain (e-signed)"


def test_leaver_password_required(monkeypatch):
    _setup(monkeypatch, [])
    monkeypatch.setattr(ep, "_open_exit_for", lambda uid: {"id": "X1"})
    with pytest.raises(HTTPException) as e:
        ep.submit_my_exit_assets(ep.ExitAssetSubmit(system_no="", system_password="   "), {"id": "L1"})
    assert e.value.status_code == 400
    assert ep.submit_my_exit_assets(ep.ExitAssetSubmit(system_no="", system_password="pw"), {"id": "L1"}) == {"ok": True}
