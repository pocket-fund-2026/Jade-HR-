import re
from types import SimpleNamespace

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
        "role": "employee", "email": "asha@jadecouture.com", "password_hash": auth.hash_password("oldpass1"),
        "failed_login_count": 4, "locked_until": None,
    }
    sent = []
    monkeypatch.setattr(auth_routes, "supabase", db)
    monkeypatch.setattr(auth_routes.email_service, "send_email", lambda to, subject, body, kind="general": sent.append((to, body)) or True)
    app = FastAPI()
    app.include_router(auth_routes.router)
    return TestClient(app), db, sent


def _token(sent):
    return re.search(r"token=(\S+)", sent[-1][1]).group(1)


def test_reset_link_works_once_and_unlocks(client):
    c, db, sent = client
    assert c.post("/api/auth/forgot-password", json={"employee_code": " 14001 "}).json()["ok"]
    assert sent[-1][0] == "asha@jadecouture.com"
    token = _token(sent)
    assert c.post("/api/auth/reset-password", json={"token": token, "password": "newpass99"}).status_code == 200
    assert auth.verify_password("newpass99", db.rows["14001"]["password_hash"])
    assert db.rows["14001"]["failed_login_count"] == 0
    # the same link cannot be used twice
    assert c.post("/api/auth/reset-password", json={"token": token, "password": "another1"}).status_code == 400


def test_unknown_code_gets_same_reply_and_no_mail(client):
    c, _, sent = client
    r = c.post("/api/auth/forgot-password", json={"employee_code": "nope"})
    assert r.json() == auth_routes.FORGOT_REPLY and not sent


def test_garbage_and_session_tokens_rejected(client):
    c, db, _ = client
    assert c.post("/api/auth/reset-password", json={"token": "x.y.z", "password": "newpass99"}).status_code == 400
    session = auth.create_access_token(db.rows["14001"])
    assert c.post("/api/auth/reset-password", json={"token": session, "password": "newpass99"}).status_code == 400
