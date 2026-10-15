from datetime import date, timedelta, datetime
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from config import IST
from models import CompOffGrant
from routers import leave, comp_off
from payroll import compute_daily_attendance


class FakeDB:
    def __init__(self, tables):
        self.tables = tables
        self.writes = []

    def table(self, name):
        db = self

        class Query:
            def __getattr__(self, name):
                return lambda *a, **kw: self

            def insert(self, row):
                db.writes.append(row)
                return self

            def update(self, row):
                db.writes.append(row)
                return self

            def execute(self):
                return SimpleNamespace(data=db.tables.get(name, []))

        return Query()


def test_revised_validity():
    assert leave.COMP_OFF_VALIDITY_DAYS == 120


def test_midnight_alone_does_not_accrue():
    assert comp_off._accrual_rows_for({'daily': [{'date': '2026-10-12', 'comp_off_eligible_v3': True}]}) == []


@pytest.mark.parametrize('hours,units', [(0.25, 0.5), (4, 0.5), (4.01, 1), (8, 1)])
def test_attendance_hours_boundary(hours, units):
    start = datetime.fromisoformat('2026-10-11T09:00:00+05:30')
    rows = compute_daily_attendance(2026, 10, [start, start + timedelta(hours=hours)], 8, is_corporate=True)
    row = next(r for r in rows if r['date'] == '2026-10-11')
    assert row['comp_off_eligible']
    assert row['comp_off_units'] == units


@pytest.fixture
def employee():
    return {'id': 'e1', 'is_active': True, 'weekly_off_day': 6, 'location': 'Mumbai'}


def prepare_dates(monkeypatch, requests=None, holidays=None):
    monkeypatch.setattr(leave, '_comp_off_holidays', lambda e: holidays or {})
    db = FakeDB({'hr_leave_requests': requests or []})
    monkeypatch.setattr(leave, 'supabase', db)
    return db


def test_two_working_days_allowed(monkeypatch, employee):
    prepare_dates(monkeypatch)
    leave._validate_comp_off_dates(employee, date(2026, 10, 13), date(2026, 10, 14))


@pytest.mark.parametrize('start,end', [('2026-10-10', '2026-10-10'), ('2026-10-12', '2026-10-12'), ('2026-10-11', '2026-10-11')])
def test_weekly_off_cannot_be_in_or_adjacent_to_leave(monkeypatch, employee, start, end):
    prepare_dates(monkeypatch)
    with pytest.raises(HTTPException) as err:
        leave._validate_comp_off_dates(employee, date.fromisoformat(start), date.fromisoformat(end))
    assert 'weekly offs' in err.value.detail


def test_festival_break_cannot_be_clubbed(monkeypatch, employee):
    prepare_dates(monkeypatch, holidays={date(2026, 10, 15): {'day_type': 'closed'}})
    with pytest.raises(HTTPException) as err:
        leave._validate_comp_off_dates(employee, date(2026, 10, 14), date(2026, 10, 14))
    assert 'festival breaks' in err.value.detail


def test_adjacent_requests_cannot_bypass_two_day_cap(monkeypatch, employee):
    prepare_dates(monkeypatch, requests=[{'id': 'other', 'start_date': '2026-10-13', 'end_date': '2026-10-14'}])
    with pytest.raises(HTTPException) as err:
        leave._validate_comp_off_dates(employee, date(2026, 10, 15), date(2026, 10, 15))
    assert 'maximum of 2' in err.value.detail


def test_approval_excludes_current_request(monkeypatch, employee):
    prepare_dates(monkeypatch, requests=[{'id': 'current', 'start_date': '2026-10-13', 'end_date': '2026-10-14'}])
    leave._validate_comp_off_dates(employee, date(2026, 10, 13), date(2026, 10, 14), 'current')


@pytest.mark.parametrize('hours', [0, -1, 25])
def test_grant_rejects_invalid_hours(hours):
    with pytest.raises(ValidationError):
        CompOffGrant(employee_id='e1', earned_date=date.today(), units=1, hours_worked=hours)


def test_manual_grant_requires_correct_units(monkeypatch, employee):
    with pytest.raises(HTTPException) as err:
        leave.grant_comp_off(CompOffGrant(employee_id='e1', earned_date=date.today(), units=1, hours_worked=4), {'id': 'admin'})
    assert 'half a day' in err.value.detail


def test_manual_grant_uses_120_day_expiry(monkeypatch, employee):
    today = datetime.now(IST).date()
    earned = today - timedelta(days=(today.weekday() - 6) % 7)
    db = FakeDB({'hr_employees': employee, 'hr_comp_off_ledger': []})
    monkeypatch.setattr(leave, 'supabase', db)
    monkeypatch.setattr(leave, '_comp_off_holidays', lambda e: {})
    # Insert response needs to return the new row.
    original_table = db.table
    def table(name):
        q = original_table(name)
        if name == 'hr_comp_off_ledger':
            q.insert = lambda row: SimpleNamespace(execute=lambda: SimpleNamespace(data=[row]))
        return q
    monkeypatch.setattr(db, 'table', table)
    row = leave.grant_comp_off(CompOffGrant(employee_id='e1', earned_date=earned, units=0.5, hours_worked=4), {'id': 'admin'})
    assert row['expiry_date'] == (earned + timedelta(days=120)).isoformat()


def test_consuming_one_day_does_not_waste_half_day(monkeypatch):
    db = FakeDB({'hr_comp_off_ledger': [{'id': 'half', 'units': 0.5}, {'id': 'full', 'units': 1}]})
    monkeypatch.setattr(leave, 'supabase', db)
    captured = []
    original = db.table
    def table(name):
        q = original(name)
        q.in_ = lambda column, ids: (captured.extend(ids) or q)
        return q
    monkeypatch.setattr(db, 'table', table)
    assert leave._consume_comp_off('e1', 1, 'req')
    assert captured == ['full']


def test_future_day_cannot_be_granted():
    with pytest.raises(HTTPException) as err:
        leave.grant_comp_off(CompOffGrant(employee_id='e1', earned_date=datetime.now(IST).date() + timedelta(days=1), units=1, hours_worked=6), {'id': 'admin'})
    assert 'future' in err.value.detail


def test_expired_day_cannot_be_granted():
    with pytest.raises(HTTPException) as err:
        leave.grant_comp_off(CompOffGrant(employee_id='e1', earned_date=datetime.now(IST).date() - timedelta(days=121), units=1, hours_worked=6), {'id': 'admin'})
    assert '120-day' in err.value.detail


def test_ordinary_working_day_cannot_be_granted(monkeypatch, employee):
    today = datetime.now(IST).date()
    earned = today - timedelta(days=(today.weekday() - 1) % 7)  # Tuesday
    monkeypatch.setattr(leave, 'supabase', FakeDB({'hr_employees': employee}))
    monkeypatch.setattr(leave, '_comp_off_holidays', lambda e: {})
    with pytest.raises(HTTPException) as err:
        leave.grant_comp_off(CompOffGrant(employee_id='e1', earned_date=earned, units=1, hours_worked=6), {'id': 'admin'})
    assert 'declared public holiday' in err.value.detail


def test_balance_must_survive_until_leave_date(monkeypatch):
    db = FakeDB({'hr_comp_off_ledger': []})
    captured = []
    original = db.table
    def table(name):
        q = original(name)
        q.gte = lambda column, value: (captured.append((column, value)) or q)
        return q
    monkeypatch.setattr(db, 'table', table)
    monkeypatch.setattr(leave, 'supabase', db)
    use_on = datetime.now(IST).date() + timedelta(days=45)
    leave._comp_off_available('e1', use_on)
    assert ('expiry_date', use_on.isoformat()) in captured


@pytest.mark.parametrize('status,used_id,expected', [('available', None, 'available'), ('expired', None, 'available'), ('used', 'request', 'used'), ('available', 'request', 'used')])
def test_reconcile_preserves_used_credits_and_restores_valid_unused(status, used_id, expected):
    row = {'earned_date': '2026-07-01', 'expiry_date': '2026-09-29', 'status': status, 'used_in_leave_request_id': used_id}
    assert comp_off._revised_credit_expiry(row, date(2026, 10, 15)) == {'expiry_date': '2026-10-29', 'status': expected}


def test_reconcile_expired_credit_stays_expired():
    row = {'earned_date': '2026-01-01', 'expiry_date': '2026-04-01', 'status': 'expired'}
    assert comp_off._revised_credit_expiry(row, date(2026, 10, 15))['status'] == 'expired'


def test_reconcile_is_idempotent():
    row = {'earned_date': '2026-07-01', 'expiry_date': '2026-10-29', 'status': 'available'}
    assert comp_off._revised_credit_expiry(row, date(2026, 10, 15)) is None


def test_reconcile_excludes_credits_before_effective_date():
    row = {'earned_date': '2025-10-31', 'expiry_date': '2026-01-29', 'status': 'expired'}
    assert comp_off._revised_credit_expiry(row, date(2026, 10, 15)) is None


def test_reconcile_dry_run_never_writes(monkeypatch):
    row = {'id':'row', 'earned_date': '2026-07-01', 'expiry_date': '2026-09-29', 'status': 'available'}
    db = FakeDB({'hr_comp_off_ledger': [row]})
    monkeypatch.setattr(comp_off, 'supabase', db)
    result = comp_off.reconcile_comp_off_validity(dry_run=True, user={'role':'accounts'})
    assert result['expiry_updates'] == 1
    assert db.writes == []
