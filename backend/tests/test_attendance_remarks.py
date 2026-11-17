from datetime import date

import routers.reports as reports


def test_attach_manual_remarks(monkeypatch):
    monkeypatch.setattr(reports, "fetch_all_paged", lambda *a, **k: [{"employee_id": "e1", "date": "2026-10-22", "remark": "Left early"}])
    results = [{"employee_id": "e1", "daily": [{"date": "2026-10-22"}, {"date": "2026-10-23"}]}, {"employee_id": "e2", "daily": [{"date": "2026-10-22"}]}]
    reports._attach_manual_remarks(results, date(2026, 10, 1), date(2026, 10, 31))
    assert results[0]["daily"][0]["remark_manual"] == "Left early"
    assert "remark_manual" not in results[0]["daily"][1]
    assert "remark_manual" not in results[1]["daily"][0]


def test_attach_manual_remarks_survives_missing_table(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("relation hr_attendance_remarks does not exist")
    monkeypatch.setattr(reports, "fetch_all_paged", boom)
    results = [{"employee_id": "e1", "daily": [{"date": "2026-10-22"}]}]
    reports._attach_manual_remarks(results, date(2026, 10, 1), date(2026, 10, 31))
    assert "remark_manual" not in results[0]["daily"][0]
