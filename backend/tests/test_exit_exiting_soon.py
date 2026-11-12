from routers import exit_procedure


class _Q:
    def __init__(self, data): self.data = data
    def select(self, *_): return self
    def or_(self, *_): return self
    def in_(self, *_): return self
    def eq(self, *_): return self
    def execute(self):
        class R: pass
        r = R(); r.data = self.data; return r


class _DB:
    def __init__(self, tables): self.tables = tables
    def table(self, name): return _Q(self.tables[name])


def _run(monkeypatch, profiles, employees, exits=()):
    monkeypatch.setattr(exit_procedure, "supabase", _DB({
        "hr_employee_profile": profiles, "hr_employees": employees, "hr_exit_records": list(exits),
    }))
    return exit_procedure.exiting_soon_rows("2026-11-12")


def _emp(i, active=True):
    return {"id": i, "employee_code": i, "first_name": i, "last_name": "", "department": "D", "is_active": active}


def test_includes_null_status_sorts_by_date_and_flags_overdue(monkeypatch):
    rows = _run(
        monkeypatch,
        [
            {"employee_id": "b", "employee_status": None, "scheduled_exit_date": "2026-12-01", "exit_date": None},
            {"employee_id": "a", "employee_status": "On Notice", "scheduled_exit_date": "2026-11-01", "exit_date": None},
        ],
        [_emp("a"), _emp("b")],
    )
    assert [r["employee_id"] for r in rows] == ["a", "b"]  # NULL-status person is not dropped
    assert rows[0]["overdue"] and not rows[1]["overdue"]


def test_excludes_exited_and_inactive_and_links_open_exit(monkeypatch):
    rows = _run(
        monkeypatch,
        [
            {"employee_id": "x", "employee_status": "Exited", "scheduled_exit_date": "2026-11-20", "exit_date": "2026-11-20"},
            {"employee_id": "y", "employee_status": "", "scheduled_exit_date": "2026-11-20", "exit_date": None},
            {"employee_id": "z", "employee_status": "", "scheduled_exit_date": "2026-11-25", "exit_date": None},
        ],
        [_emp("x"), _emp("y", active=False), _emp("z")],
        exits=[{"id": "E1", "employee_id": "z"}],
    )
    assert [r["employee_id"] for r in rows] == ["z"]
    assert rows[0]["exit_id"] == "E1"


def test_exit_date_wins_over_scheduled(monkeypatch):
    rows = _run(monkeypatch, [{"employee_id": "a", "employee_status": "", "scheduled_exit_date": "2026-12-31", "exit_date": "2026-11-30"}], [_emp("a")])
    assert rows[0]["exit_on"] == "2026-11-30"
