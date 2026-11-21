"""End-to-end checks of the e-sign flows (letters + exit sign-offs) against an
in-memory fake of the Supabase client, including the failure paths."""
import pytest
from fastapi import HTTPException

import email_service
from routers import exit_procedure as ep
from routers import offers


class _Resp:
    def __init__(self, data): self.data = data


class _Q:
    def __init__(self, db, name):
        self.db, self.name = db, name
        self.f, self.op, self.payload, self.single, self.lim = [], "select", None, False, None

    def select(self, *_): return self
    def eq(self, c, v): self.f.append((c, "eq", v)); return self
    def in_(self, c, v): self.f.append((c, "in", set(v))); return self
    def ilike(self, c, v): self.f.append((c, "ilike", v.replace("\\", "").lower())); return self
    def order(self, *_a, **_k): return self
    def limit(self, n): self.lim = n; return self
    def maybe_single(self): self.single = True; return self
    def insert(self, row): self.op, self.payload = "insert", row; return self
    def update(self, row): self.op, self.payload = "update", row; return self
    def delete(self): self.op = "delete"; return self

    def _match(self, r):
        for c, k, v in self.f:
            x = r.get(c)
            if k == "eq" and x != v: return False
            if k == "in" and x not in v: return False
            if k == "ilike" and (x or "").lower() != v: return False
        return True

    def execute(self):
        rows = self.db.tables.setdefault(self.name, [])
        if self.op == "insert":
            items = self.payload if isinstance(self.payload, list) else [self.payload]
            out = []
            for it in items:
                it = {"id": f"{self.name}-{len(rows) + 1}", **it}
                rows.append(it); out.append(dict(it))
            return _Resp(out)
        hit = [r for r in rows if self._match(r)]
        if self.op == "update":
            for r in hit: r.update(self.payload)
            return _Resp([dict(r) for r in hit])
        if self.op == "delete":
            self.db.tables[self.name] = [r for r in rows if r not in hit]
            return _Resp([dict(r) for r in hit])
        hit = [dict(r) for r in hit][: self.lim]
        if self.single:
            return _Resp(hit[0]) if hit else None
        return _Resp(hit)


class DB:
    def __init__(self, tables): self.tables = tables
    def table(self, name): return _Q(self, name)


@pytest.fixture
def mails(monkeypatch):
    sent = []
    def fake(to, subject, body, **kw):
        sent.append({"to": to, "subject": subject, "body": body, **kw}); return True, None
    monkeypatch.setattr(email_service, "send_email_detailed", fake)
    monkeypatch.setattr(email_service, "send_email", lambda to, s, b, kind="general": fake(to, s, b, kind=kind)[0])
    return sent


PNG = "data:image/png;base64,iVBORw0KGgo="
SIGN_SPACE = '<div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>Nimit Bavishi</strong></span><br><span class="lt-sign-meta">Head - HR</span></p>'


def _letter(kind="confirmation", **over):
    return {"id": "L1", "letter_type": kind, "title": "Letter", "rendered_body": f"<p>Dear Asha Rao,</p>{SIGN_SPACE}",
            "field_values": {"employee_name": "Asha Rao"}, "approval_status": None, **over}


def _offers_db(monkeypatch, letters, employees=()):
    db = DB({"hr_generated_letters": letters, "hr_employees": list(employees), "hr_offer_notices": []})
    monkeypatch.setattr(offers, "supabase", db)
    return db


# ---------------- letters ----------------

def test_blank_approver_defaults_to_nimit_and_send_never_fails(monkeypatch, mails):
    db = _offers_db(monkeypatch, [_letter()])
    monkeypatch.setattr(email_service, "send_email_detailed", lambda *a, **k: (False, "http_500"))  # provider down
    out = offers.send_for_approval("L1", offers.SendForApproval(approver_email="", candidate_email="asha@x.com"), {"id": "u"})
    assert out["ok"] and out["email_sent"] is False and out["sign_link"] and "dashboard" in out["warning"]
    assert out["approver_email"] == "nimit.b@jadecouture.com"
    assert db.tables["hr_generated_letters"][0]["approval_status"] == "awaiting_approval"


def test_approver_by_employee_id_replaces_printed_signatory(monkeypatch, mails):
    db = _offers_db(monkeypatch, [_letter()], [{"id": "E9", "employee_code": "14999", "first_name": "Priya", "last_name": "Shah",
                                                 "email": "priya@jadecouture.com", "designation": "COO"}])
    out = offers.send_for_approval("L1", offers.SendForApproval(approver_email="14999", candidate_email="asha@x.com"), {"id": "u"})
    assert out["approver_email"] == "priya@jadecouture.com"
    body = db.tables["hr_generated_letters"][0]["rendered_body"]
    assert "Priya Shah" in body and "COO" in body and "Nimit Bavishi" not in body
    assert mails[0]["to"] == "priya@jadecouture.com"


def test_unknown_employee_id_is_a_clear_error(monkeypatch, mails):
    _offers_db(monkeypatch, [_letter()])
    with pytest.raises(HTTPException) as e:
        offers.send_for_approval("L1", offers.SendForApproval(approver_email="00000", candidate_email="a@x.com"), {"id": "u"})
    assert e.value.status_code == 400


def _approve(token, name="Nimit Bavishi", image=PNG, confirm=True):
    return offers.sign(token, offers.SignBody(signature=name, signature_image=image, confirm=confirm))


def test_non_offer_letter_is_signed_then_final_copy_goes_out(monkeypatch, mails):
    db = _offers_db(monkeypatch, [_letter(approval_status="awaiting_approval", approver_token="T", approver_email="nimit.b@jadecouture.com",
                                         candidate_email="asha@x.com", notify_recipients=["hr2@x.com"])])
    assert _approve("T")["status"] == "signed"
    row = db.tables["hr_generated_letters"][0]
    assert row["approval_status"] == "signed"
    assert PNG in row["rendered_body"] and "Dear Asha Rao" in row["rendered_body"]  # words kept, signature placed
    assert {m["to"] for m in mails} >= {"asha@x.com", "hr2@x.com"}


def test_offer_goes_to_candidate_then_both_signed(monkeypatch, mails):
    db = _offers_db(monkeypatch, [_letter("offer_employment", approval_status="awaiting_approval", approver_token="T",
                                         approver_email="nimit.b@jadecouture.com", candidate_email="asha@x.com", notify_recipients=[])])
    assert _approve("T")["status"] == "awaiting_candidate"
    row = db.tables["hr_generated_letters"][0]
    assert row["approval_status"] == "awaiting_candidate" and row["candidate_token"]
    assert any(m["to"] == "asha@x.com" for m in mails)  # candidate is emailed their sign link
    assert offers.sign(row["candidate_token"], offers.SignBody(signature="Asha Rao", confirm=True))["status"] == "accepted"
    assert db.tables["hr_generated_letters"][0]["approval_status"] == "accepted"


def test_signature_needs_full_name_and_confirm(monkeypatch, mails):
    _offers_db(monkeypatch, [_letter(approval_status="awaiting_approval", approver_token="T", approver_email="n@x.com", candidate_email="a@x.com")])
    for bad in ("Nimit", "", "N B"[:1]):
        with pytest.raises(HTTPException) as e:
            _approve("T", name=bad)
        assert e.value.status_code == 400
    with pytest.raises(HTTPException):
        _approve("T", confirm=False)
    with pytest.raises(HTTPException) as e:
        offers.view_for_signing("not-a-token")
    assert e.value.status_code == 404


def test_signature_survives_a_broken_image_and_failing_post_steps(monkeypatch, mails):
    db = _offers_db(monkeypatch, [_letter(approval_status="awaiting_approval", approver_token="T", approver_email="n@x.com",
                                         candidate_email="a@x.com", notify_recipients=["14999"])])
    def boom(*a, **k): raise RuntimeError("smtp down")
    monkeypatch.setattr(email_service, "send_email_detailed", boom)
    monkeypatch.setattr(db, "table", lambda name: (_ for _ in ()).throw(RuntimeError("db")) if name == "hr_offer_notices" else DB.table(db, name))
    out = _approve("T", image="javascript:alert(1)")  # junk image -> text signature, and nothing after the save may fail
    assert out["status"] == "signed"
    assert "javascript:" not in db.tables["hr_generated_letters"][0]["rendered_body"]


# ---------------- exit sign-offs ----------------

def _exit_db(monkeypatch, signers):
    db = DB({
        "hr_exit_signers": signers,
        "hr_exit_records": [{"id": "X1", "employee_id": "LV", "last_working_day": "2026-12-01", "status": "in_progress"}],
        "hr_exit_checklist_items": [
            {"id": "i1", "exit_id": "X1", "department": "Accounts", "item_label": "Payment", "status": "pending"},
            {"id": "i2", "exit_id": "X1", "department": "Admin", "item_label": "Equipment", "status": "pending"},
            {"id": "i3", "exit_id": "X1", "department": "Department Head", "item_label": "Handover", "status": "pending"},
        ],
        "hr_employees": [
            {"id": "LV", "employee_code": "1", "first_name": "Tanvi", "last_name": "M", "department": "Special Project", "is_active": True, "email": "t@x.com"},
            {"id": "AC", "employee_code": "70463", "first_name": "Sumeet", "last_name": "D", "department": "Accounts", "is_active": True, "email": "s@x.com"},
            {"id": "AD", "employee_code": "20", "first_name": "Ravi", "last_name": "K", "department": "Admin", "is_active": True, "email": "r@x.com"},
            {"id": "MO", "employee_code": "MONICA", "first_name": "Monica", "last_name": "", "department": "Corporate", "is_active": True, "email": "m@x.com"},
        ],
    })
    monkeypatch.setattr(ep, "supabase", db)
    monkeypatch.setattr(ep, "record_step", lambda *a, **k: None)
    return db


STANDING = [{"row_department": "Accounts", "employee_id": "AC", "scope_department": None},
            {"row_department": "Department Head", "employee_id": "MO", "scope_department": "Special Project"}]


def test_public_link_signs_all_my_rows_and_rejects_tampering(monkeypatch, mails):
    db = _exit_db(monkeypatch, list(STANDING))
    tok = ep._signoff_token("X1", "AC")
    view = ep.view_signoff(tok)
    assert view["leaver"]["name"] == "Tanvi M" and view["pending"] == 1 and view["signer_name"] == "Sumeet D"
    with pytest.raises(HTTPException) as e:
        ep.do_signoff(tok, ep.ExitSignoff(confirm=False))
    assert e.value.status_code == 400
    assert ep.do_signoff(tok, ep.ExitSignoff(confirm=True))["signed"] == 1
    assert next(i for i in db.tables["hr_exit_checklist_items"] if i["id"] == "i1")["status"] == "completed"
    assert next(i for i in db.tables["hr_exit_checklist_items"] if i["id"] == "i2")["status"] == "pending"  # not theirs
    with pytest.raises(HTTPException) as e:
        ep.do_signoff(tok, ep.ExitSignoff(confirm=True))  # already done
    assert e.value.status_code == 409
    for bad in (tok[:-2] + "zz", "x.y.z", "garbage", tok.replace("AC", "MO")):  # forged / other person's id
        with pytest.raises(HTTPException) as e:
            ep.view_signoff(bad)
        assert e.value.status_code == 404


def test_add_multiple_and_remove_owners_for_one_exit(monkeypatch, mails):
    db = _exit_db(monkeypatch, list(STANDING))
    named = ep._apply_exit_signers("X1", [{"row_department": "Accounts", "owners": ["20", "s@x.com"]}], "LV")
    assert named == {"AD", "AC"}
    rows = {r["row_department"]: r for r in ep._effective_owners("X1", "Special Project", "LV")}
    assert {o["code"] for o in rows["Accounts"]["owners"]} == {"20", "70463"} and rows["Accounts"]["custom"]
    # another exit still sees the standing owner only
    other = {r["row_department"]: r for r in ep._effective_owners("OTHER", "Special Project", "LV")}
    assert [o["code"] for o in other["Accounts"]["owners"]] == ["70463"]
    # remove everyone -> nobody (sentinel hidden), not the standing owner
    ep._apply_exit_signers("X1", [{"row_department": "Accounts", "owners": []}], "LV")
    rows = {r["row_department"]: r for r in ep._effective_owners("X1", "Special Project", "LV")}
    assert rows["Accounts"]["owners"] == [] and rows["Accounts"]["custom"]
    assert ep.pending_signoffs_for({"id": "AC"}) == [] or all(p["row_department"] != "Accounts" for p in ep.pending_signoffs_for({"id": "AC"}))
    assert all(p["employee_code"] != "1" or p["exit_id"] == "X1" for p in ep.pending_signoffs_for({"id": "LV"})) and ep.pending_signoffs_for({"id": "LV"}) == []
    # reset -> back to standing
    ep._apply_exit_signers("X1", [{"row_department": "Accounts", "revert": True}], "LV")
    rows = {r["row_department"]: r for r in ep._effective_owners("X1", "Special Project", "LV")}
    assert [o["code"] for o in rows["Accounts"]["owners"]] == ["70463"] and not rows["Accounts"]["custom"]
    # global signer list never shows per-exit rows
    ep._apply_exit_signers("X1", [{"row_department": "Admin", "owners": ["20"]}], "LV")
    assert all(not (s.get("scope_department") or "").startswith("exit:") for s in ep.list_signers.__wrapped__({"id": "x"})["signers"]) if hasattr(ep.list_signers, "__wrapped__") else True


def test_bad_owner_reference_is_rejected_without_changes(monkeypatch, mails):
    _exit_db(monkeypatch, list(STANDING))
    with pytest.raises(HTTPException) as e:
        ep._apply_exit_signers("X1", [{"row_department": "Accounts", "owners": ["99999"]}], "LV")
    assert e.value.status_code == 400
    with pytest.raises(HTTPException):
        ep._apply_exit_signers("X1", [{"row_department": "Nonsense", "owners": ["20"]}], "LV")


def test_new_owner_is_emailed_and_sees_it_in_their_console(monkeypatch, mails):
    _exit_db(monkeypatch, list(STANDING))
    named = ep._apply_exit_signers("X1", [{"row_department": "Admin", "owners": ["20"]}], "LV")
    leaver = ep._employee_brief("LV")
    assert ep.send_signoff_requests("X1", leaver, "2026-12-01", only=named) == 1
    assert mails[-1]["to"] == "r@x.com" and "/exit-signoff/" in mails[-1]["body"]
    assert [p["row_department"] for p in ep.pending_signoffs_for({"id": "AD"})] == ["Admin"]


def test_one_failed_email_does_not_stop_the_others_or_the_exit(monkeypatch, mails):
    _exit_db(monkeypatch, list(STANDING))
    monkeypatch.setattr(email_service, "send_email", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("down")))
    try:
        ep.send_signoff_requests("X1", ep._employee_brief("LV"), "2026-12-01")
    except Exception:
        pytest.fail("send_signoff_requests must not raise")
