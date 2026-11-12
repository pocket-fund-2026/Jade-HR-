import pytest
from fastapi import HTTPException

from models import OnboardingSubmissionCreate
from routers import onboarding


class _Q:
    def __init__(self, data): self._d = data
    def select(self, *_): return self
    def eq(self, *_): return self
    def limit(self, *_): return self
    def execute(self):
        class R: pass
        r = R(); r.data = self._d; return r


class _SB:
    def __init__(self, rows): self.rows = rows
    def table(self, _): return _Q(self.rows)


def _body(**kw):
    return OnboardingSubmissionCreate(full_name="A B", **kw)


def test_submit_rejected_without_signed_offer(monkeypatch):
    monkeypatch.setattr(onboarding, "supabase", _SB([]))
    with pytest.raises(HTTPException) as e:
        onboarding.submit_onboarding(_body(offer_token="nope"))
    assert e.value.status_code == 403


def test_submit_rejected_with_no_token(monkeypatch):
    monkeypatch.setattr(onboarding, "supabase", _SB([{"id": "x"}]))
    with pytest.raises(HTTPException) as e:
        onboarding.submit_onboarding(_body())
    assert e.value.status_code == 403


def test_offer_check(monkeypatch):
    monkeypatch.setattr(onboarding, "supabase", _SB([{"id": "x", "candidate_email": "c@x.com"}]))
    assert onboarding.offer_check("t") == {"valid": True, "email": "c@x.com"}
    monkeypatch.setattr(onboarding, "supabase", _SB([]))
    assert onboarding.offer_check("t")["valid"] is False
