-- JADE HR — Accounts/HR access control
-- Paste into the Supabase SQL editor of the existing project (run once).
--
-- Splits the old single 'admin' role into 'accounts' (full access, controls
-- what HR can see) and 'hr' (day-to-day people ops, gated by hr_permissions).
-- Existing 'admin' accounts become 'accounts' so nobody is locked out.

alter table hr_employees drop constraint if exists hr_employees_role_check;

update hr_employees set role = 'accounts' where role = 'admin';

alter table hr_employees add constraint hr_employees_role_check
    check (role in ('accounts', 'hr', 'employee'));

-- One row per togglable admin-console capability. hr_can_access governs the
-- 'hr' role only — 'accounts' always has full access and is the only role
-- that can write to this table (enforced in the backend, not RLS, same as
-- every other hr_* table).
create table if not exists hr_permissions (
    permission_key  text primary key,
    label           text not null,
    hr_can_access   boolean not null default true,
    updated_by      uuid references hr_employees(id),
    updated_at      timestamptz not null default now()
);

insert into hr_permissions (permission_key, label, hr_can_access) values
    ('employees.view',   'View employee directory',                                    true),
    ('employees.manage', 'Create / edit / deactivate employees',                       true),
    ('salary.view',      'View salary figures (Basic/HRA/Conveyance/Other, payslips)',  false),
    ('salary.edit',      'Edit salary structure / bulk salary import',                  false),
    ('payroll.view',     'View Payroll & OT section and payroll figures on Dashboard',  false),
    ('disputes.manage',  'View & resolve attendance disputes',                          true),
    ('leave.manage',     'View & resolve leave requests',                               true),
    ('biometric.view',   'View biometric sync status/log',                              true)
on conflict (permission_key) do nothing;

alter table hr_permissions enable row level security;
