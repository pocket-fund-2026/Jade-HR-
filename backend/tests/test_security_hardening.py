"""Regression tests for the 2026-11-26 security review. Each one failed before the fix."""
import time
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from jose import jwt

import auth
from config import JWT_ALGORITHM, JWT_SECRET
from routers import letters, offers


class _Q:
    def __init__(self, row): self.row = row
    def __getattr__(self, n): return lambda *a, **k: self
    def execute(self): return type("R", (), {"data": self.row})()


class _Req:
    def __init__(self, token): self.cookies = {}; self.headers = {"Authorization": f"Bearer {token}"}


def _token(**extra):
    claims = {"id": "u1", "pv": auth._password_fingerprint("h"), "exp": datetime.now(timezone.utc) + timedelta(minutes=5), **extra}
    return jwt.encode(claims, JWT_SECRET, algorithm=JWT_ALGORITHM)


@pytest.fixture
def user_db(monkeypatch):
    monkeypatch.setattr(auth, "supabase", type("S", (), {"table": lambda s, n: _Q({"id": "u1", "is_active": True, "password_hash": "h", "role": "hr"})})())
    monkeypatch.setattr(auth, "maybe_single_data", lambda r: r.data)
    monkeypatch.setattr(auth, "touch_seen", lambda e: None)


def test_session_token_still_works(user_db):
    assert auth.get_current_user(_Req(_token()))["id"] == "u1"


@pytest.mark.parametrize("purpose", ["pwreset", "magic"])
def test_emailed_link_tokens_are_not_sessions(user_db, purpose):
    with pytest.raises(HTTPException) as e:
        auth.get_current_user(_Req(_token(purpose=purpose)))
    assert e.value.status_code == 401


def test_alg_none_and_wrong_key_rejected(user_db):
    forged = jwt.encode({"id": "u1", "pv": auth._password_fingerprint("h")}, "other-key", algorithm="HS256")
    with pytest.raises(HTTPException):
        auth.get_current_user(_Req(forged))


def test_overlong_password_is_a_clean_refusal_not_a_crash():
    h = auth.hash_password("short-one")
    assert auth.verify_password("x" * 200, h) is False
    assert auth.verify_password("é" * 40, h) is False          # 80 bytes in 40 characters
    with pytest.raises(HTTPException) as e:
        auth.hash_password("é" * 40)
    assert e.value.status_code == 400


def test_login_model_caps_lengths():
    from models import LoginRequest
    with pytest.raises(ValueError):
        LoginRequest(employee_code="9" * 65, password="x")
    with pytest.raises(ValueError):
        LoginRequest(employee_code="1", password="x" * 73)


@pytest.mark.parametrize("payload", ["<img/onerror=alert(1) src=x>", "<svg/onload=alert(1)>", '<a href="jav&#x61;script:alert(1)">x</a>',
                                      '<a href="&#106;avascript:alert(1)">x</a>', "<math><mi xlink:href=javascript:alert(1)>"])
def test_letter_sanitizer_blocks_regex_bypasses(payload):
    out = letters.sanitize_letter_html(payload).lower()
    assert "onerror" not in out and "onload" not in out and "javascript" not in out and "<svg" not in out


def test_letter_sanitizer_is_linear_time():
    t = time.time()
    letters.sanitize_letter_html("<script " * 20000 + "<script" * 20000)
    assert time.time() - t < 2


def test_email_regex_is_linear_time():
    t = time.time()
    offers.EMAIL_RE.match("a@" + "." * 30000 + " ")
    assert time.time() - t < 1
    assert offers.EMAIL_RE.match("first.last@jadecouture.com")
    assert not offers.EMAIL_RE.match("no-at-sign.com")
