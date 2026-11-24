"""Gmail API transport + HR_MAIL_TEST_ONLY redirect in email_service (no network)."""
import base64
import json
import email as pyemail
from unittest import mock

import email_service as es


class _Resp:
    def __init__(self, body): self._b = json.dumps(body).encode()
    def read(self): return self._b
    def __enter__(self): return self
    def __exit__(self, *a): return False


def _setup(monkeypatch, transport="gmail", test_only="", resend=""):
    monkeypatch.setattr(es, "GMAIL_CLIENT_ID", "cid"); monkeypatch.setattr(es, "GMAIL_CLIENT_SECRET", "sec")
    monkeypatch.setattr(es, "GMAIL_REFRESH_TOKEN", "rt"); monkeypatch.setattr(es, "EMAIL_TRANSPORT", transport)
    monkeypatch.setattr(es, "HR_MAIL_TEST_ONLY", test_only); monkeypatch.setattr(es, "RESEND_API_KEY", resend)
    monkeypatch.setitem(es._GMAIL_TOKEN, "value", None)
    monkeypatch.setattr(es, "log_attempt", lambda *a, **k: logged.append((a, k)))


logged = []


def test_gmail_send_builds_mime_and_logs_gmail_id(monkeypatch):
    _setup(monkeypatch); logged.clear(); sent = {}
    def fake(req, timeout=0):
        if "oauth2" in req.full_url: return _Resp({"access_token": "tok", "expires_in": 3600})
        sent["raw"] = json.loads(req.data)["raw"]; sent["auth"] = req.headers["Authorization"]
        return _Resp({"id": "m123"})
    with mock.patch("urllib.request.urlopen", fake):
        ok, err = es.send_email_detailed("a@x.com", "Hi", "Body", cc=["b@x.com"], attachments=[{"filename": "f.txt", "content": base64.b64encode(b"hello").decode()}])
    assert ok and err is None and sent["auth"] == "Bearer tok"
    m = pyemail.message_from_bytes(base64.urlsafe_b64decode(sent["raw"] + "=="))
    assert m["To"] == "a@x.com" and m["Cc"] == "b@x.com" and m["Subject"] == "Hi"
    assert any(p.get_filename() == "f.txt" for p in m.walk())
    assert logged[-1][1]["provider_id"] == "gmail:m123"


def test_test_only_redirects_everything(monkeypatch):
    _setup(monkeypatch, test_only="me@x.com"); logged.clear(); sent = {}
    def fake(req, timeout=0):
        if "oauth2" in req.full_url: return _Resp({"access_token": "t", "expires_in": 3600})
        sent["raw"] = json.loads(req.data)["raw"]; return _Resp({"id": "1"})
    with mock.patch("urllib.request.urlopen", fake):
        assert es.send_email_detailed("emp@x.com", "Leave", "b", cc=["boss@x.com"])[0]
    m = pyemail.message_from_bytes(base64.urlsafe_b64decode(sent["raw"] + "=="))
    assert m["To"] == "me@x.com" and m["Cc"] is None and m["Subject"] == "[Test for emp@x.com] Leave"


def test_gmail_failure_falls_back_to_resend(monkeypatch):
    _setup(monkeypatch, resend="re_x"); logged.clear(); calls = []
    def fake(req, timeout=0):
        calls.append(req.full_url)
        if "oauth2" in req.full_url: raise RuntimeError("boom")
        return _Resp({"id": "r1"})
    with mock.patch("urllib.request.urlopen", fake):
        ok, err = es.send_email_detailed("a@x.com", "S", "b")
    assert ok and logged[-1][1]["provider_id"] == "r1" and any("resend" in c for c in calls)


def test_default_transport_is_resend_only(monkeypatch):
    _setup(monkeypatch, transport="resend", resend="")
    assert es.is_configured() is False
