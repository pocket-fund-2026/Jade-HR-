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


def test_set_remark_503_when_verify_read_fails(monkeypatch):
    import pytest
    from fastapi import HTTPException

    class Q:
        def __init__(self, fail): self.fail = fail
        def upsert(self, *a, **k): return self
        def select(self, *a, **k): return self
        def eq(self, *a, **k): return self
        def limit(self, *a, **k): return self
        def execute(self):
            if self.fail:
                raise RuntimeError("boom")
            return type("R", (), {"data": []})()

    calls = {"n": 0}

    class SB:
        def table(self, name):
            calls["n"] += 1
            return Q(fail=calls["n"] > 1)  # write ok, verify read fails

    monkeypatch.setattr(reports, "supabase", SB())
    body = reports.AttendanceRemarkSet(date=date(2026, 10, 22), remark="0.5")
    with pytest.raises(HTTPException) as e:
        reports.set_attendance_remark("e1", body, user={"id": "u"})
    assert e.value.status_code == 503


def test_set_remark_only_accepts_day_earned_number(monkeypatch):
    import pytest
    from fastapi import HTTPException

    writes = []

    class Q:
        def upsert(self, row, **k): writes.append(row["remark"]); return self
        def select(self, *a, **k): return self
        def eq(self, *a, **k): return self
        def limit(self, *a, **k): return self
        def execute(self): return type("R", (), {"data": [{"remark": writes[-1] if writes else ""}]})()

    monkeypatch.setattr(reports, "supabase", type("SB", (), {"table": lambda self, n: Q()})())
    for bad in ("Left at 4pm", "1.5", "-0.5", "1/2", "0.5 day"):
        with pytest.raises(HTTPException) as e:
            reports.set_attendance_remark("e1", reports.AttendanceRemarkSet(date=date(2026, 10, 22), remark=bad), user={"id": "u"})
        assert e.value.status_code == 422, bad
    assert writes == []
    for good, stored in (("0.5", "0.5"), (" 1 ", "1"), ("0,75", "0.75"), (".25", ".25"), ("0", "0")):
        try:
            reports.set_attendance_remark("e1", reports.AttendanceRemarkSet(date=date(2026, 10, 22), remark=good), user={"id": "u"})
        except HTTPException as exc:
            assert exc.status_code != 422, good
        assert writes[-1] == stored
