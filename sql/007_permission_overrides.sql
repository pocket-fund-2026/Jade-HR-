-- JADE HR — Per-person permission overrides
-- Paste into the Supabase SQL editor of the existing project (run once).
--
-- hr_permissions controls defaults for the whole 'hr' role. This table lets
-- Accounts (or anyone granted the new 'permissions.manage' key) grant or
-- deny a SPECIFIC permission to a SPECIFIC hr-role person, without changing
-- what every other hr login sees — e.g. two named people can see salary
-- figures while the rest of the HR team still can't.
create table if not exists hr_permission_overrides (
    id             uuid primary key default gen_random_uuid(),
    employee_id    uuid not null references hr_employees(id) on delete cascade,
    permission_key text not null,
    granted        boolean not null,
    updated_by     uuid references hr_employees(id),
    updated_at     timestamptz not null default now(),
    unique (employee_id, permission_key)
);

create index if not exists idx_hr_permission_overrides_employee on hr_permission_overrides (employee_id);

alter table hr_permission_overrides enable row level security;

insert into hr_permissions (permission_key, label, hr_can_access) values
    ('permissions.manage', 'Manage per-person access overrides for other HR logins', false)
on conflict (permission_key) do nothing;
