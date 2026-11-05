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
    with pytest.raises(HTTPException) as denied:
        nimit_requests.all_requests({"employee_code": "2000", "is_active": True, "role": "hr"})
    assert denied.value.status_code == 403
    assert len(seen) == 3
