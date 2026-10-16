from types import SimpleNamespace
from unittest.mock import Mock

from auth import verify_password
from routers import biometric


def test_new_biometric_accounts_use_hr_initial_password(monkeypatch):
    query = Mock()
    query.select.return_value = query
    query.in_.return_value = query
    query.execute.return_value = SimpleNamespace(data=[{'employee_code': '14831'}])
    database = Mock()
    database.table.return_value = query
    monkeypatch.setattr(biometric, 'supabase', database)

    count = biometric._auto_provision_employees([
        {'employee_code': '14831', 'device_location': 'Mumbai'},
        {'employee_code': '15001', 'device_location': 'Delhi'},
        {'employee_code': '15001', 'device_location': 'Delhi'},
    ])

    assert count == 1
    args, kwargs = query.upsert.call_args
    assert kwargs == {'on_conflict': 'employee_code', 'ignore_duplicates': True}
    assert len(args[0]) == 1
    employee = args[0][0]
    assert employee['employee_code'] == '15001'
    assert employee['location'] == 'Delhi'
    assert employee['role'] == 'employee'
    assert employee['is_active'] is True
    assert employee['password_changed_by_employee'] is False
    assert verify_password('Jade@001', employee['password_hash'])
    assert not verify_password('Jade@1', employee['password_hash'])


def test_existing_biometric_accounts_are_never_overwritten(monkeypatch):
    query = Mock()
    query.select.return_value = query
    query.in_.return_value = query
    query.execute.return_value = SimpleNamespace(data=[{'employee_code': '14831'}])
    database = Mock()
    database.table.return_value = query
    monkeypatch.setattr(biometric, 'supabase', database)

    assert biometric._auto_provision_employees([
        {'employee_code': '14831', 'device_location': 'Mumbai'},
    ]) == 0
    query.upsert.assert_not_called()


def test_empty_ingest_does_not_provision(monkeypatch):
    database = Mock()
    monkeypatch.setattr(biometric, 'supabase', database)
    assert biometric._auto_provision_employees([]) == 0
    database.table.assert_not_called()
