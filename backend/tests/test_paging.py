import contextvars
import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest
from postgrest.exceptions import APIError

import paging
from routers import leave, payroll, wfh


class FakeQuery:
    """PostgREST in miniature: filters, ordering, exact count and 1000-row-style
    ranges, including the 416 error for an offset past the end."""

    def __init__(self, db, table, count):
        self.db, self.table, self.want_count = db, table, count
        self.filters, self.orders, self.window = [], [], None

    def select(self, *_, count=None):
        self.want_count = count
        return self

    def _flt(self, col, test):
        self.filters.append(lambda r: test(r.get(col)))
        return self

    def eq(self, col, val): return self._flt(col, lambda v: v == val)
    def gte(self, col, val): return self._flt(col, lambda v: v is not None and v >= val)
    def lte(self, col, val): return self._flt(col, lambda v: v is not None and v <= val)
    def order(self, col): self.orders.append(col); return self
    def range(self, a, b): self.window = (a, b); return self

    def execute(self):
        self.db.calls.append((self.table, self.window, tuple(self.orders), threading.current_thread().name))
        if self.db.fail_after is not None and len(self.db.calls) > self.db.fail_after:
            raise self.db.fail_with
        rows = [r for r in self.db.tables[self.table] if all(f(r) for f in self.filters)]
        for col in reversed(self.orders):
            rows = sorted(rows, key=lambda r: r[col])
        total = len(rows)
        if self.window:
            a, b = self.window
            if a >= total and total:
                raise APIError({"message": "Requested range not satisfiable", "code": "PGRST103"})
            rows = rows[a:b + 1]
            if self.db.max_rows:  # a server-side cap below what the client asked for
                rows = rows[:self.db.max_rows]
        return SimpleNamespace(data=rows, count=None if self.db.hide_count else total)


class FakeDB:
    def __init__(self, **tables):
        self.tables, self.calls, self.hide_count, self.max_rows = tables, [], False, None
        self.fail_after, self.fail_with = None, None

    def table(self, name):
        return FakeQuery(self, name, None)


@pytest.fixture
def db(monkeypatch):
    def install(**tables):
        fake = FakeDB(**tables)
        for mod in (paging, payroll, leave, wfh):
            monkeypatch.setattr(mod, "supabase", fake)
        return fake
    return install


def rows(n):
    return [{"id": i} for i in range(n)]


def test_one_page_is_one_call(db):
    fake = db(t=rows(40))
    assert paging.fetch_all_paged("t", "id", ("id",)) == rows(40)
    assert len(fake.calls) == 1


@pytest.mark.parametrize("n", [1001, 2500, 6053])
def test_every_row_once_in_order_with_one_call_per_page(db, n):
    fake = db(t=list(reversed(rows(n))))  # stored out of order on purpose
    assert paging.fetch_all_paged("t", "id", ("id",)) == rows(n)
    assert len(fake.calls) == -(-n // 1000)  # first page + the rest, no extras


def test_exact_multiple_of_page_size_makes_no_empty_extra_call(db):
    fake = db(t=rows(2000))
    assert paging.fetch_all_paged("t", "id", ("id",)) == rows(2000)
    assert len(fake.calls) == 2


@pytest.mark.parametrize("cap", [500, 250, 999])
def test_a_server_cap_below_1000_still_returns_every_row(db, cap):
    fake = db(t=list(reversed(rows(2300))))
    fake.max_rows = cap
    assert paging.fetch_all_paged("t", "id", ("id",)) == rows(2300)


def test_a_server_cap_with_a_table_smaller_than_the_cap_is_one_call(db):
    fake = db(t=rows(300))
    fake.max_rows = 500
    assert paging.fetch_all_paged("t", "id", ("id",)) == rows(300)
    assert len(fake.calls) == 1


def test_empty_table_is_one_call_and_empty(db):
    fake = db(t=[])
    assert paging.fetch_all_paged("t", "id", ("id",)) == []
    assert len(fake.calls) == 1


def test_without_a_count_it_falls_back_to_serial_paging(db):
    fake = db(t=rows(2300))
    fake.hide_count = True
    assert paging.fetch_all_paged("t", "id", ("id",)) == rows(2300)
    assert [c[1] for c in fake.calls] == [(0, 999), (1000, 1999), (2000, 2999)]


def test_a_shrinking_table_past_the_end_is_not_an_error(db):
    fake = db(t=rows(2500))
    real_execute = FakeQuery.execute

    def shrink_then_run(self):
        if self.window == (2000, 2999):
            self.db.tables["t"] = self.db.tables["t"][:1900]  # rows vanished after the count
        return real_execute(self)

    FakeQuery.execute = shrink_then_run
    try:
        got = paging.fetch_all_paged("t", "id", ("id",))
    finally:
        FakeQuery.execute = real_execute
    assert [r["id"] for r in got] == list(range(2000))


def test_other_database_errors_are_not_swallowed(db):
    fake = db(t=rows(3000))
    fake.fail_after, fake.fail_with = 1, APIError({"message": "boom", "code": "XX000"})
    with pytest.raises(APIError):
        paging.fetch_all_paged("t", "id", ("id",))


def test_filters_and_order_reach_every_page(db):
    fake = db(t=[{"id": i, "k": "a" if i % 2 else "b"} for i in range(5000)])
    got = paging.fetch_all_paged("t", "id", ("k", "id"), lambda q: q.eq("k", "a"))
    assert len(got) == 2500 and all(r["k"] == "a" for r in got)
    assert {c[2] for c in fake.calls} == {("k", "id")}


PIN = contextvars.ContextVar("pin", default=None)


def test_plain_pool_loses_the_request_context_but_ours_keeps_it():
    PIN.set("local-epoch-1")
    with ThreadPoolExecutor(1) as plain:
        assert plain.submit(PIN.get).result() is None
    with paging.ContextThreadPoolExecutor(1) as ours:
        assert ours.submit(PIN.get).result() == "local-epoch-1"


def test_page_workers_and_nested_pools_all_see_the_request_pin(db):
    fake = db(t=rows(5000))
    seen = []
    real_execute = FakeQuery.execute

    def spy(self):
        seen.append(PIN.get())
        return real_execute(self)

    FakeQuery.execute = spy
    PIN.set("pinned")
    try:
        with paging.ContextThreadPoolExecutor(2) as outer:  # like _all_summaries_for_month's pool
            outer.submit(paging.fetch_all_paged, "t", "id", ("id",)).result()
    finally:
        FakeQuery.execute = real_execute
    assert len(seen) == 5 and set(seen) == {"pinned"}


def test_no_pool_in_the_app_is_a_plain_threadpoolexecutor():
    import pathlib, re
    root = pathlib.Path(paging.__file__).parent
    offenders = [
        str(p.relative_to(root)) for p in root.rglob("*.py")
        if "tests" not in p.parts and p.name != "paging.py"
        and re.search(r"(?<![A-Za-z])ThreadPoolExecutor\(", p.read_text())
    ]
    assert offenders == []  # a plain pool silently drops the HA database pin


# --- the real fetchers, exercised past the 1000-row cap -------------------------
def test_punch_fetch_groups_every_punch_across_pages(db):
    punches = [
        {"employee_code": f"E{i % 40:02d}", "punch_time": datetime(2026, 9, 1 + i // 100, i % 24, i % 60, tzinfo=timezone.utc).isoformat()}
        for i in range(2600)
    ]
    fake = db(hr_biometric_punches=punches)
    out = payroll._fetch_all_punches_by_employee(2026, 10)
    inside = [p for p in punches if payroll._month_bounds(2026, 10)[0] <= p["punch_time"] <= payroll._month_bounds(2026, 10)[1]]
    assert sum(len(v) for v in out.values()) == len(inside)
    assert all(all(isinstance(t, datetime) for t in v) for v in out.values())
    assert all(c[2] == ("employee_code", "punch_time") for c in fake.calls)


def test_register_rows_page_and_employee_filter(db):
    reg = [{"employee_id": f"e{e:03d}", "date": f"2026-09-{d:02d}"} for e in range(90) for d in range(1, 29)]
    db(hr_attendance_register=reg)
    assert len(payroll._fetch_register_rows(date(2026, 9, 1), date(2026, 9, 28))) == 90 * 28
    one = payroll._fetch_register_rows(date(2026, 9, 10), date(2026, 9, 12), "e007")
    assert [r["date"] for r in one] == ["2026-09-10", "2026-09-11", "2026-09-12"]


def test_overrides_no_longer_truncate_at_1000_rows(db):
    ov = [{"employee_id": f"e{e:03d}", "date": f"2026-09-{d:02d}", "status_override": "present",
           "first_in": None, "last_out": None} for e in range(60) for d in range(1, 26)]
    db(hr_attendance_overrides=ov, hr_attendance_register=[])
    by_emp = payroll._fetch_all_overrides_by_employee_range(date(2026, 9, 1), date(2026, 9, 30))
    assert sum(len(v) for v in by_emp.values()) == 1500


def test_bulk_leaves_and_wfh_page_and_still_expand_days(db):
    leaves = [{"id": i, "employee_id": f"e{i % 50}", "leave_type": "paid", "status": "approved",
               "start_date": "2026-09-10", "end_date": "2026-09-11"} for i in range(1200)]
    db(hr_leave_requests=leaves, hr_wfh_requests=[])
    out = leave.fetch_all_approved_leaves_by_employee(0, 0, date_range=(date(2026, 9, 1), date(2026, 9, 30)))
    assert len(out) == 50 and all(set(v) >= {date(2026, 9, 10), date(2026, 9, 11)} for v in out.values())
    wfh_rows = [{"id": i, "employee_id": f"w{i % 30}", "status": "approved", "work_completed": True,
                 "start_date": "2026-09-05", "end_date": "2026-09-05", "pay_treatment_percent": 50} for i in range(1100)]
    db(hr_wfh_requests=wfh_rows)
    got = wfh.fetch_all_confirmed_wfh_by_employee(0, 0, date_range=(date(2026, 9, 1), date(2026, 9, 30)))
    assert len(got) == 30 and got["w0"][date(2026, 9, 5)]["pay_treatment_percent"] == 50
