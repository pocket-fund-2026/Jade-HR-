import pytest
from fastapi import HTTPException

from routers import onboarding as ob


class _Q:
    def __init__(self, db): self.db = db
    def select(self, *_): return self
    def delete(self): self.db.calls.append("delete"); return self
    def upsert(self, row, **_): self.db.calls.append(("upsert", row)); return self
    def eq(self, *_): return self
    def execute(self):
        class R: pass
        r = R(); r.data = self.db.rows; return r


class _DB:
    def __init__(self, rows=()): self.rows, self.calls = list(rows), []
    def table(self, _): return _Q(self)


def test_no_table_or_no_rows_means_defaults(monkeypatch):
    class Boom:
        def table(self, _): raise RuntimeError("no table")
    monkeypatch.setattr(ob, "supabase", Boom())
    assert ob.public_core_fields() == {}


def test_overrides_are_returned_and_locked_fields_never_hidden(monkeypatch):
    monkeypatch.setattr(ob, "supabase", _DB([
        {"field_key": "bank_ifsc", "is_hidden": True, "label": None, "required": None},
        {"field_key": "email", "is_hidden": True, "label": "Your email", "required": True},
    ]))
    out = ob.public_core_fields()
    assert out["bank_ifsc"]["hidden"] is True
    assert out["email"]["hidden"] is False and out["email"]["label"] == "Your email"


def test_cannot_hide_name_or_email_or_make_them_optional(monkeypatch):
    monkeypatch.setattr(ob, "supabase", _DB())
    for key in ("full_name", "email"):
        with pytest.raises(HTTPException):
            ob.set_core_field(key, ob.CoreFieldIn(is_hidden=True), {"id": "u"})
        with pytest.raises(HTTPException):
            ob.set_core_field(key, ob.CoreFieldIn(required=False), {"id": "u"})


def test_reset_deletes_row_and_change_upserts(monkeypatch):
    db = _DB(); monkeypatch.setattr(ob, "supabase", db)
    assert ob.set_core_field("mobile", ob.CoreFieldIn(), {"id": "u"}) == {"ok": True, "reset": True}
    assert db.calls == ["delete"]
    ob.set_core_field("mobile", ob.CoreFieldIn(is_hidden=True, label="  Phone ", required=None), {"id": "u"})
    kind, row = db.calls[-1]
    assert row["is_hidden"] is True and row["label"] == "Phone"


def test_bad_key_rejected(monkeypatch):
    monkeypatch.setattr(ob, "supabase", _DB())
    with pytest.raises(HTTPException):
        ob.set_core_field("Bad-Key!", ob.CoreFieldIn(is_hidden=True), {"id": "u"})
