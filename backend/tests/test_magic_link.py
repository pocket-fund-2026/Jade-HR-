import re

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import auth
from routers import auth as auth_routes
from tests.test_first_login import EmployeeDB


@pytest.fixture
def client(monkeypatch):
    db = EmployeeDB()
    db.rows["14001"] = {
        "id": "e1", "employee_code": "14001", "first_name": "Asha", "last_name": "K", "is_active": True,
        "role": "hr", "email": "asha@jadecouture.com", "password_hash": auth.hash_password("pw123456"),
        "failed_login_count": 0, "locked_until": None, "login_count": 3,
    }
    sent = []
    monkeypatch.setattr(auth_routes, "supabase", db)
    monkeypatch.setattr(auth_routes, "_magic_last_sent", {})
    monkeypatch.setattr(auth_routes.email_service, "send_email", lambda to, subject, body, kind="general": sent.append((to, body)) or True)
    app = FastAPI()
    app.include_router(auth_routes.router)
    return TestClient(app), db, sent


def _token(sent):
    return re.search(r"magic=(\S+)", sent[-1][1]).group(1)


def test_link_signs_in_once(client):
    c, db, sent = client
    assert c.post("/api/auth/magic-link", json={"identifier": " 14001 "}).json()["ok"]
    assert sent[-1][0] == "asha@jadecouture.com"
    token = _token(sent)
    r = c.post("/api/auth/magic-link/verify", json={"token": token})
    assert r.status_code == 200 and r.json()["role"] == "hr"
    assert auth_routes.COOKIE_NAME in r.cookies
    assert db.rows["14001"]["login_count"] == 4
    assert c.post("/api/auth/magic-link/verify", json={"token": token}).status_code == 400


def test_unknown_person_same_reply_no_mail(client):
    c, _, sent = client
    assert c.post("/api/auth/magic-link", json={"identifier": "nope"}).json() == auth_routes.MAGIC_REPLY
    assert not sent


def test_resend_throttled(client):
    c, _, sent = client
    c.post("/api/auth/magic-link", json={"identifier": "14001"})
    c.post("/api/auth/magic-link", json={"identifier": "14001"})
    assert len(sent) == 1


def test_other_tokens_rejected(client):
    c, db, _ = client
    session = auth.create_access_token(db.rows["14001"])
    assert c.post("/api/auth/magic-link/verify", json={"token": session}).status_code == 400
    assert c.post("/api/auth/magic-link/verify", json={"token": "x.y.z"}).status_code == 400


def test_password_change_invalidates_link(client):
    c, db, sent = client
    c.post("/api/auth/magic-link", json={"identifier": "14001"})
    db.rows["14001"]["password_hash"] = auth.hash_password("changed99")
    assert c.post("/api/auth/magic-link/verify", json={"token": _token(sent)}).status_code == 400
