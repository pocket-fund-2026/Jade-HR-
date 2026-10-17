import copy
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import auth
import employee_roster_sync as roster
from routers import auth as auth_routes, biometric


class EmployeeDB:
    """In-memory boundary for exercising real provisioning and HTTP auth."""

    def __init__(self):
        self.rows = {}

    def table(self, name):
        db = self

        class Query:
            def __init__(self):
                self.filters = []
                self.single = False
                self.changes = None

            def select(self, *_):
                return self

            def eq(self, key, value):
                self.filters.append(lambda row: row.get(key) == value)
                return self

            def in_(self, key, values):
                self.filters.append(lambda row: row.get(key) in values)
                return self

            def maybe_single(self):
                self.single = True
                return self

            def limit(self, *_):
                return self

            def update(self, values):
                self.changes = values
                return self

            def upsert(self, rows, on_conflict, ignore_duplicates):
                assert on_conflict == 'employee_code' and ignore_duplicates
                for row in rows:
                    if row['employee_code'] not in db.rows:
                        db.rows[row['employee_code']] = {
                            'id': 'id-' + row['employee_code'],
                            'failed_login_count': 0, 'locked_until': None,
                            **copy.deepcopy(row),
                        }
                return self

            def execute(self):
                rows = list(db.rows.values()) if name == 'hr_employees' else []
                matches = [r for r in rows if all(f(r) for f in self.filters)]
                if self.changes is not None:
                    for row in matches:
                        row.update(self.changes)
                data = matches[0] if self.single and matches else None if self.single else matches
                return SimpleNamespace(data=copy.deepcopy(data))

        return Query()


@pytest.fixture
def login_system(monkeypatch):
    database = EmployeeDB()
    for module in (auth, auth_routes, biometric):
        monkeypatch.setattr(module, 'supabase', database)
    monkeypatch.setattr(auth_routes, 'record_login', lambda *_: None)
    monkeypatch.setattr(auth, 'touch_seen', lambda *_: None)
    app = FastAPI()
    app.include_router(auth_routes.router)
    with TestClient(app, base_url='https://testserver') as client:
        yield database, client


@pytest.mark.parametrize('code,password', [('14831', 'Jade@831'), ('15001', 'Jade@001')])
def test_first_login_change_password_and_resync(login_system, monkeypatch, code, password):
    database, client = login_system
    punch = {'employee_code': code, 'device_location': 'Mumbai'}
    assert biometric._auto_provision_employees([punch]) == 1
    login = client.post('/api/auth/login', json={'employee_code': code, 'password': password})
    assert login.status_code == 200
    old_token = login.json()['access_token']
    me = client.get('/api/auth/me')
    assert me.status_code == 200
    assert me.json()['password_changed_by_employee'] is False

    changed = client.post('/api/auth/change-password', json={
        'current_password': password, 'new_password': 'Personal-test-password-123',
    })
    assert changed.status_code == 200
    assert client.get('/api/auth/me').json()['password_changed_by_employee'] is True
    personal_hash = database.rows[code]['password_hash']
    assert biometric._auto_provision_employees([punch]) == 0

    calls = []
    def roster_api(token, method, path, body=None):
        calls.append((method, path, body))
        if path == '/api/employees':
            return 200, [copy.deepcopy(database.rows[code])]
        if path.startswith('/api/onboarding/'):
            return 200, []
        if method == 'PUT':
            database.rows[code].update(body)
            return 200, {}
        raise AssertionError((method, path))
    monkeypatch.setattr(roster, '_api', roster_api)
    result = roster.reconcile(
        'EmployeeCode,EmployeeName,Department,Status,DOJ\n'
        f'{code},Test Employee,Mumbai-Madhu Estate Staff,Working,2026-10-01\n', 'test-token')
    assert result['updated'] == 1
    assert all('password' not in (body or {}) for _, _, body in calls)
    assert database.rows[code]['password_hash'] == personal_hash

    # Password changes revoke the original session, while the refreshed cookie works.
    client.cookies.clear()
    assert client.get('/api/auth/me', headers={'Authorization': 'Bearer ' + old_token}).status_code == 401
    assert client.post('/api/auth/login', json={'employee_code': code, 'password': password}).status_code == 401
    assert client.post('/api/auth/login', json={
        'employee_code': code, 'password': 'Personal-test-password-123',
    }).status_code == 200
    assert database.rows[code]['failed_login_count'] == 0


@pytest.mark.parametrize('department', list(roster.DEPARTMENTS))
def test_roster_creates_same_initial_credentials_for_every_location(monkeypatch, department):
    created = []
    def roster_api(token, method, path, body=None):
        if method == 'GET':
            return 200, []
        assert method == 'POST' and path == '/api/employees'
        created.append(body)
        return 200, {}
    monkeypatch.setattr(roster, '_api', roster_api)
    result = roster.reconcile(
        'EmployeeCode,EmployeeName,Department,Status,DOJ\n'
        f'15001,Test Employee,{department},Working,2026-10-01\n', 'test-token')
    assert result['created'] == 1
    assert created[0]['password'] == 'Jade@001'


def test_inactive_account_cannot_log_in(login_system):
    database, client = login_system
    biometric._auto_provision_employees([{'employee_code': '14831', 'device_location': 'Mumbai'}])
    database.rows['14831']['is_active'] = False
    assert client.post('/api/auth/login', json={'employee_code': '14831', 'password': 'Jade@831'}).status_code == 401
