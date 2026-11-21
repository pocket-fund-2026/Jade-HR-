from fastapi import HTTPException
import pytest

from routers import nimit_requests


def test_nimit_can_read_all_three_queues_without_approval_permissions(monkeypatch):
    seen = []
    monkeypatch.setattr(nimit_requests, "list_leave_requests", lambda **kwargs: seen.append("leave") or [{"id": "l"}])
    monkeypatch.setattr(nimit_requests, "list_absence_requests", lambda **kwargs: seen.append("absence") or [{"id": "a"}])
    monkeypatch.setattr(nimit_requests, "list_disputes", lambda **kwargs: seen.append("disputes") or [{"id": "d"}])
    result = nimit_requests.all_requests({"employee_code": "14456", "is_active": True, "role": "hr"})
    assert list(result) == ["leave", "absence", "disputes"]
    assert seen == ["leave", "absence", "disputes"]
    monkeypatch.setattr(nimit_requests, "user_can", lambda user, *keys: False)
    with pytest.raises(HTTPException) as denied:
        nimit_requests.all_requests({"id": "x", "employee_code": "2000", "is_active": True, "role": "hr"})
    assert denied.value.status_code == 403
    assert len(seen) == 3


def test_permission_holder_can_read_and_others_cannot(monkeypatch):
    monkeypatch.setattr(nimit_requests, "list_leave_requests", lambda **kw: [])
    monkeypatch.setattr(nimit_requests, "list_absence_requests", lambda **kw: [])
    monkeypatch.setattr(nimit_requests, "list_disputes", lambda **kw: [])
    monkeypatch.setattr(nimit_requests, "user_can", lambda user, *keys: user["id"] == "granted" and "requests.view_all" in keys)
    granted = {"id": "granted", "employee_code": "9001", "is_active": True, "role": "hr"}
    assert list(nimit_requests.all_requests(granted)) == ["leave", "absence", "disputes"]
    with pytest.raises(HTTPException):
        nimit_requests.all_requests({"id": "other", "employee_code": "9002", "is_active": True, "role": "hr"})
    with pytest.raises(HTTPException):
        nimit_requests.all_requests({**granted, "is_active": False})
