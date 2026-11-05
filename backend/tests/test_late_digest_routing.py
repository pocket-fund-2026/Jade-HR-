from datetime import date

from routers import payroll


def test_late_digest_goes_to_team_hr_and_other_reporting_managers(monkeypatch):
    late = [
        {"employee_id": "one", "name": "One", "employee_code": "1", "location": "Mumbai", "time": "10:30"},
        {"employee_id": "two", "name": "Two", "employee_code": "2", "location": "Mumbai", "time": "10:40"},
    ]
    sent = []
    monkeypatch.setattr(payroll, "_late_arrivals", lambda target: late)
    monkeypatch.setattr(payroll, "_reporting_manager_emails", lambda ids: {
        "one": ["nimit.b@jadecouture.com", "other.manager@jadecouture.com"],
        "two": ["other.manager@jadecouture.com"],
    })
    monkeypatch.setattr(payroll.email_service, "notify_late_digest", lambda day, people, recipient, **kwargs: (
        sent.append((recipient, len(people), kwargs)) or True, None
    ))

    result = payroll.late_digest(for_date=date(2026, 11, 5), dry_run=False, user={})

    assert [recipient for recipient, _, _ in sent] == [
        "team.hr@jadecouture.com", "other.manager@jadecouture.com",
    ]
    assert sent[0][1] == 2
    assert sent[1][1] == 2
    assert result["emailed"] is True
