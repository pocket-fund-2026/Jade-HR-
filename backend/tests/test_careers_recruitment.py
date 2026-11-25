"""Careers recruitment: interviewer source, own-availability fencing, round-2 email, acceptance dispatch (idempotency,
safety switches, graceful degradation). No real mail is sent: email sending is a stub."""

import pytest

import careers_dispatch
import careers_support


# ---------- interviewers ----------
EMPS = [
    {"id": "m1", "first_name": "Asha", "last_name": "Rao", "email": "Asha@jadecouture.com", "designation": "Design Lead", "is_active": True},
    {"id": "s1", "first_name": "Ravi", "last_name": "K", "email": "ravi@jadecouture.com", "designation": "Store Manager - Pedder Road", "is_active": True},
    {"id": "e1", "first_name": "Zed", "last_name": "", "email": "zed@jadecouture.com", "designation": "Tailor", "is_active": True},
    {"id": "m2", "first_name": "Gone", "last_name": "Away", "email": "gone@jadecouture.com", "designation": "Manager", "is_active": False},
    {"id": "m3", "first_name": "No", "last_name": "Mail", "email": "", "designation": "Manager", "is_active": True},
    {"id": "b1", "first_name": "Both", "last_name": "Roles", "email": "both@jadecouture.com", "designation": "Store Manager", "is_active": True},
]


def test_interviewers_are_active_reporting_managers_and_store_managers():
    out = careers_support.build_interviewers(EMPS, {"m1", "m2", "m3", "b1"})
    assert [r["email"] for r in out] == ["asha@jadecouture.com", "both@jadecouture.com", "ravi@jadecouture.com"]
    assert {r["name"]: r["reason"] for r in out} == {
        "Asha Rao": "Reporting manager", "Both Roles": "Reporting manager + Store manager", "Ravi K": "Store manager"}


def test_ordinary_employee_is_not_an_interviewer():
    assert careers_support.interviewer_reason(EMPS[2], {"m1"}) is None


# ---------- own availability ----------
ROWS = [{"id": 1, "email": "asha@jadecouture.com", "name": "Asha"}, {"id": 2, "email": "ravi@jadecouture.com", "name": "Ravi"}]


def test_availability_rows_are_fenced_to_the_signed_in_person():
    assert [r["id"] for r in careers_support.own_availability(ROWS, "ASHA@jadecouture.com")] == [1]
    assert careers_support.own_availability(ROWS, "") == []
    assert careers_support.owns_availability(ROWS, "asha@jadecouture.com", 1)
    assert not careers_support.owns_availability(ROWS, "asha@jadecouture.com", 2)


def test_saving_ignores_a_client_supplied_id_email_or_name():
    user = {"email": "asha@jadecouture.com", "first_name": "Asha", "last_name": "Rao"}
    out = careers_support.fence_availability_body({"id": 2, "email": "ravi@jadecouture.com", "name": "Hijack", "slot_min": 45}, user, ROWS)
    assert out == {"slot_min": 45, "email": "asha@jadecouture.com", "name": "Asha Rao", "id": 1}
    new_user = {"email": "new@jadecouture.com", "first_name": "New", "last_name": ""}
    assert "id" not in careers_support.fence_availability_body({"id": 2}, new_user, ROWS)
    with pytest.raises(ValueError):
        careers_support.fence_availability_body({}, {"email": ""}, ROWS)


# ---------- round-2 email ----------
def test_round2_email_has_candidate_notes_and_link():
    subject, body = careers_support.compose_round2_email(
        candidate="Priya Sharma", role="Fashion Designer", notes="Strong draping.", source_label="Granola",
        source_url="https://notes.granola.ai/d/abc", sender="Lucky", message="Please focus on pattern cutting.")
    assert subject == "Interview notes: Priya Sharma (Fashion Designer)"
    for needle in ("Lucky shared", "Please focus on pattern cutting.", "Full notes (Granola): https://notes.granola.ai/d/abc", "Strong draping."):
        assert needle in body


# ---------- acceptance dispatch ----------
class FakeStore:
    def __init__(self, letter=None, broken=False):
        self.rows, self.letter, self.broken, self.claims = {}, letter, broken, 0

    def get(self, app_id):
        if self.broken:
            raise RuntimeError("relation does not exist")
        return self.rows.get(app_id)

    def claim(self, app_id):
        self.claims += 1
        self.rows.setdefault(app_id, {"application_id": app_id})
        return True

    def save(self, app_id, fields):
        self.rows[app_id].update(fields)

    def find_offer_letter(self, email):
        return self.letter


LETTER = {"id": "L1", "title": "Offer Letter", "letter_type": "offer", "approval_status": "accepted", "rendered_body": "<p>Hi</p>"}
APP = {"id": 7, "full_name": "Priya Sharma", "email": "Priya@Example.com"}


class Sender:
    def __init__(self, fail_kinds=()):
        self.sent, self.fail_kinds = [], fail_kinds

    def __call__(self, to, subject, body, *, kind, **kw):
        if kind in self.fail_kinds:
            return False, "boom"
        self.sent.append((to, kind))
        return True, None


@pytest.fixture
def live(monkeypatch):
    monkeypatch.setenv("CAREERS_ACCEPT_DISPATCH", "on")


def test_auto_dispatch_is_off_unless_the_flag_is_on(monkeypatch):
    monkeypatch.delenv("CAREERS_ACCEPT_DISPATCH", raising=False)
    send, store = Sender(), FakeStore(LETTER)
    out = careers_dispatch.dispatch(APP, store, actor="x", send=send)
    assert out["result"] == "held" and send.sent == [] and store.rows == {}


def test_sends_offer_and_onboarding_once_then_never_again(live):
    send, store = Sender(), FakeStore(LETTER)
    out = careers_dispatch.dispatch(APP, store, actor="Lucky", send=send)
    assert out["result"] == "sent"
    assert send.sent == [("priya@example.com", "careers_offer_letter"), ("priya@example.com", "careers_onboarding_link")]
    assert store.rows[7]["offer_sent_at"] and store.rows[7]["onboarding_sent_at"] and store.rows[7]["attempts"] == 1
    again = careers_dispatch.dispatch(APP, store, actor="Lucky", send=send)
    assert again["result"] == "already_sent" and len(send.sent) == 2


def test_partial_failure_retries_only_the_missing_part(live):
    store = FakeStore(LETTER)
    first = careers_dispatch.dispatch(APP, store, actor="x", send=Sender(fail_kinds=("careers_onboarding_link",)))
    assert first["result"] == "partial" and store.rows[7]["offer_sent_at"] and not store.rows[7].get("onboarding_sent_at")
    send = Sender()
    careers_dispatch.dispatch(APP, store, actor="x", send=send)
    assert send.sent == [("priya@example.com", "careers_onboarding_link")]


def test_unapproved_or_missing_letter_blocks_only_the_offer_part(live):
    send = Sender()
    out = careers_dispatch.dispatch(APP, FakeStore({**LETTER, "approval_status": "awaiting_approval"}), actor="x", send=send)
    assert out["result"] == "partial" and "not approved" in out["errors"][0]
    assert [k for _, k in send.sent] == ["careers_onboarding_link"]
    out = careers_dispatch.dispatch(APP, FakeStore(None), actor="x", send=Sender())
    assert "No offer letter" in out["errors"][0]


def test_careers_test_mode_holds_automatic_sends_but_not_a_manual_resend(live):
    send, store = Sender(), FakeStore(LETTER)
    status = {"test_only": ["tina@jadecouture.com"]}
    assert careers_dispatch.dispatch(APP, store, actor="x", send=send, mail_status=status)["result"] == "held"
    assert send.sent == []
    ok = careers_dispatch.dispatch(APP, store, actor="Lucky", send=send, force=True, mail_status=status)
    assert ok["result"] == "sent" and len(send.sent) == 2


def test_manual_resend_sends_again_even_after_a_full_dispatch(live):
    send, store = Sender(), FakeStore(LETTER)
    careers_dispatch.dispatch(APP, store, actor="x", send=send)
    careers_dispatch.dispatch(APP, store, actor="Lucky", send=send, force=True, only="onboarding")
    assert [k for _, k in send.sent].count("careers_onboarding_link") == 2
    assert [k for _, k in send.sent].count("careers_offer_letter") == 1


def test_missing_table_fails_closed_for_auto_and_still_allows_a_manual_click(live):
    send = Sender()
    assert careers_dispatch.dispatch(APP, FakeStore(LETTER, broken=True), actor="x", send=send)["result"] == "unavailable"
    assert send.sent == []
    out = careers_dispatch.dispatch(APP, FakeStore(LETTER, broken=True), actor="Lucky", send=send, force=True)
    assert out["result"] == "sent" and len(send.sent) == 2


def test_a_second_concurrent_request_does_not_send(live):
    class Busy(FakeStore):
        def claim(self, app_id):
            return False

    send = Sender()
    assert careers_dispatch.dispatch(APP, Busy(LETTER), actor="x", send=send)["result"] == "in_progress"
    assert send.sent == []


def test_bad_email_is_rejected_before_anything_is_sent(live):
    send = Sender()
    assert careers_dispatch.dispatch({"id": 1, "email": "nope"}, FakeStore(LETTER), actor="x", send=send)["result"] == "no_valid_email"
    assert send.sent == []


def test_view_states():
    assert careers_dispatch.view(None)["state"] == "not_sent"
    assert careers_dispatch.view({"offer_sent_at": "t"})["state"] == "partial"
    assert careers_dispatch.view({"offer_sent_at": "t", "onboarding_sent_at": "t"})["state"] == "sent"
    assert careers_dispatch.view({"last_error": "x"})["state"] == "failed"


# ---------- the endpoints themselves ----------
def test_status_patch_to_offer_accepted_triggers_dispatch_and_other_statuses_do_not(monkeypatch):
    from routers import careers

    calls = []
    monkeypatch.setattr(careers, "_proxy", lambda method, path, **kw: {"id": 7, "status": "Offer Accepted"})
    monkeypatch.setattr(careers, "auto_dispatch", lambda app_id, user: calls.append(app_id) or {"result": "sent"})
    out = careers.update_application(7, {"status": "Offer Accepted"}, user={"id": "u"})
    assert out["dispatch"] == {"result": "sent"} and calls == [7]
    out = careers.update_application(7, {"status": "Interviewing"}, user={"id": "u"})
    assert "dispatch" not in out and calls == [7]
