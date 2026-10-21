import copy
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest

import email_service
import onboarding_pipeline as pipeline
from routers import letters


class FakeDB:
    """In-memory stand-in for the few PostgREST calls the pipeline makes,
    including the field_values->>key JSON filter."""

    def __init__(self):
        self.tables = {}

    def table(self, name):
        rows = self.tables.setdefault(name, [])

        def value(row, key):
            if "->>" in key:
                col, sub = key.split("->>")
                v = (row.get(col) or {}).get(sub)
                return None if v is None else str(v)
            return row.get(key)

        class Q:
            def __init__(self):
                self.filters, self.single, self.op, self.payload, self.n = [], False, "select", None, None

            def select(self, *_):
                return self

            def eq(self, k, v):
                self.filters.append(lambda r: value(r, k) == v)
                return self

            def neq(self, k, v):
                self.filters.append(lambda r: value(r, k) != v)
                return self

            def in_(self, k, vs):
                self.filters.append(lambda r: value(r, k) in vs)
                return self

            def order(self, *_a, **_k):
                return self

            def limit(self, n):
                self.n = n
                return self

            def maybe_single(self):
                self.single = True
                return self

            def insert(self, payload):
                self.op, self.payload = "insert", payload
                return self

            def update(self, payload):
                self.op, self.payload = "update", payload
                return self

            def upsert(self, payload, on_conflict=None):
                self.op, self.payload, self.key = "upsert", payload, on_conflict
                return self

            def execute(self):
                if self.op == "insert":
                    row = {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat(), **copy.deepcopy(self.payload)}
                    rows.append(row)
                    return SimpleNamespace(data=[copy.deepcopy(row)])
                if self.op == "upsert":
                    existing = [r for r in rows if r.get(self.key) == self.payload[self.key]]
                    if existing:
                        existing[0].update(copy.deepcopy(self.payload))
                    else:
                        rows.append(copy.deepcopy(self.payload))
                    return SimpleNamespace(data=[self.payload])
                hits = [r for r in rows if all(f(r) for f in self.filters)]
                if self.op == "update":
                    for r in hits:
                        r.update(copy.deepcopy(self.payload))
                    return SimpleNamespace(data=copy.deepcopy(hits))
                if self.n:
                    hits = hits[: self.n]
                if self.single:
                    return SimpleNamespace(data=copy.deepcopy(hits[0])) if hits else None
                return SimpleNamespace(data=copy.deepcopy(hits))

        return Q()


@pytest.fixture
def env(monkeypatch):
    db = FakeDB()
    sent = []
    for mod in (pipeline, letters):
        monkeypatch.setattr(mod, "supabase", db)

    def fake_send(to, subject, body, **kw):
        sent.append({"to": to, "subject": subject, "body": body, "kind": kw.get("kind"), "cc": kw.get("cc")})
        return (bool(to), None if to else "no_recipient")

    monkeypatch.setattr(email_service, "send_email_detailed", fake_send)
    hr = {"id": "hr-1", "employee_code": "1", "first_name": "Laki", "last_name": "Gupta", "email": "laki@jadecouture.com"}
    mgr = {"id": "mgr-1", "employee_code": "14000", "first_name": "Monica", "last_name": "S", "email": "monica@jadecouture.com"}
    db.tables["hr_employees"] = [hr, mgr]
    return SimpleNamespace(db=db, sent=sent)


def _offer(env):
    row = {
        "id": "offer-1", "letter_type": "offer_employment", "generated_by": "hr-1", "candidate_email": "asha@gmail.com",
        "candidate_signed_at": datetime.now(timezone.utc).isoformat(),
        "field_values": {"employee_name": "Asha Mehta", "designation": "Business Analyst", "department": "Strategy", "joining_date": "3rd November 2026"},
    }
    env.db.tables.setdefault("hr_generated_letters", []).append(row)
    return row


def _nda(env):
    return next(r for r in env.db.tables["hr_generated_letters"] if r["letter_type"] == "nda")


def test_full_pipeline(env):
    pipeline.save_settings({"slack_invite_link": "https://join.slack.com/t/jade/shared_invite/x", "analyst_doc_url": "https://docs.example/analyst",
                            "escalation_email": "gaurav@jadecouture.com"}, "hr-1")
    case = pipeline.start_from_offer(_offer(env))
    assert case["date_of_joining"] == "2026-11-03"
    assert case["is_analyst"] is True
    assert env.sent[-1]["to"] == "asha@gmail.com" and "Non-Disclosure" in env.sent[-1]["subject"]
    assert pipeline.start_from_offer(_offer(env)) is None  # idempotent

    nda = _nda(env)
    assert "Asha Mehta" in nda["rendered_body"] and "Dev Shah" in nda["rendered_body"]
    pipeline.nda_sign(nda, "candidate", "Asha Mehta", True)
    kinds = [m["kind"] for m in env.sent]
    assert "onboarding_nda_countersign" in kinds and "onboarding_form_link" in kinds
    dev_mail = next(m for m in env.sent if m["kind"] == "onboarding_nda_countersign")
    assert dev_mail["to"] == "dev@pocket-fund.com" and "/sign/" in dev_mail["body"]

    pipeline.nda_sign(_nda(env), "approver", "Dev Shah", True)
    case = pipeline.get_case(case["id"])
    assert case["nda_dev_signed_at"]

    pipeline.on_form_submitted(case["form_token"], "sub-1")
    env.db.tables["hr_employees"].append({"id": "emp-9", "employee_code": "14999", "first_name": "Asha", "last_name": "Mehta", "email": "asha@gmail.com", "designation": "Business Analyst"})
    pipeline.on_form_approved({"id": "sub-1", "designation": "Business Analyst", "date_of_joining": "2026-11-03"}, "emp-9")
    case = pipeline.get_case(case["id"])
    assert case["employee_id"] == "emp-9"
    pipeline.set_manager(case, "mgr-1")
    assert next(e for e in env.db.tables["hr_employees"] if e["id"] == "emp-9")["leave_approver_id"] == "mgr-1"

    pipeline.set_work_email(case, "asha.mehta@jadecouture.com")
    pipeline.save_case(case)
    bio = next(m for m in env.sent if m["kind"] == "onboarding_biometric")
    assert bio["to"] == "laki@jadecouture.com" and "14999" in bio["body"]
    welcome = next(m for m in env.sent if m["kind"] == "onboarding_welcome")
    assert welcome["to"] == "asha.mehta@jadecouture.com" and "join.slack.com" in welcome["body"] and "docs.example/analyst" in welcome["body"]
    assert not any(m["kind"] == "onboarding_complete_manager" for m in env.sent)

    pipeline.biometric_confirm(case, "14999", ["fingerprint"], "Laki Gupta", "")
    pipeline.save_case(case)
    done = next(m for m in env.sent if m["kind"] == "onboarding_complete_manager")
    assert done["to"] == "monica@jadecouture.com" and "Asha Mehta" in done["body"]
    assert pipeline.get_case(case["id"])["status"] == "completed"
    assert pipeline.escalate()["flagged"] == []

    if __import__("os").environ.get("SHOW_MAILS"):
        for m in env.sent:
            print(f"\n=== [{m['kind']}] to {m['to']} cc {m['cc']}\nSubject: {m['subject']}\n{m['body']}")


def test_escalation_flags_stuck_steps(env):
    pipeline.save_settings({"escalation_email": "gaurav@jadecouture.com"}, "hr-1")
    case = pipeline.start_from_offer(_offer(env))
    old = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    case["nda_sent_at"] = old
    case["date_of_joining"] = "2020-01-01"
    pipeline.save_case(case)
    result = pipeline.escalate()
    issues = result["flagged"][0]["issues"]
    assert any("NDA sent" in i for i in issues) and any("no work email" in i for i in issues)
    mail = env.sent[-1]
    assert mail["to"] == "gaurav@jadecouture.com" and mail["kind"] == "onboarding_escalation"


def test_test_mode_redirects_everything(env):
    case = pipeline.create_case(candidate_name="Test Joiner", candidate_email="x@gmail.com", generated_by="hr-1", test_recipient="tina@jadecouture.com")
    pipeline.send_nda(case, "hr-1")
    assert env.sent[-1]["to"] == "tina@jadecouture.com" and env.sent[-1]["subject"].startswith("[TEST]")


def test_settings_hidden_from_letter_templates(env):
    pipeline.save_settings({"slack_bot_token": "xoxb-secret"}, "hr-1")
    env.db.tables["hr_letter_templates"].append({"letter_type": "confirmation", "title": "C", "body": "{{a}}"})
    assert [t["letter_type"] for t in letters.list_templates(user={})] == ["confirmation"]
    assert pipeline.public_settings()["slack_bot_token"] == "" and pipeline.public_settings()["slack_bot_token_set"]
