-- Exit procedure: HOD e-sign owners + leaver's system password.
-- Apply to the PRIMARY first, then mirror to Supabase (allowlist + cloud_guard trigger for the new table).

alter table hr_exit_records add column if not exists system_password text not null default '';

create table if not exists hr_exit_signers (
    id               uuid primary key default gen_random_uuid(),
    row_department   text not null,                                   -- checklist row label, e.g. 'Costing/Purchase'
    employee_id      uuid not null references hr_employees(id) on delete cascade,
    scope_department text,                                            -- only for 'Department Head': the leaver's department this person heads
    created_at       timestamptz not null default now(),
    unique (row_department, employee_id, scope_department)
);

-- Siyal Jain (14463) signs Costing/Purchase.
insert into hr_exit_signers (row_department, employee_id)
select 'Costing/Purchase', id from hr_employees where employee_code = '14463'
on conflict do nothing;
