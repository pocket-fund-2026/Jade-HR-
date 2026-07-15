-- JADE HR — HR team's own payslip approval workflow.
-- Paste into the Supabase SQL editor (run once).
--
-- HR-role logins get a personal "My Payslip" view (like every other
-- employee's self-service payslip) under the admin console, but — unlike
-- a plain employee — their own payslip needs Accounts sign-off before it's
-- considered final. One row per (employee, pay period); resubmitting after
-- a rejection just flips the same row back to 'pending' rather than
-- accumulating history, mirroring how hr_attendance_disputes/
-- hr_leave_requests track a single live status per item.
create table if not exists hr_payslip_approvals (
    id                uuid primary key default gen_random_uuid(),
    employee_id       uuid not null references hr_employees(id) on delete cascade,
    period_year       int not null,
    period_month      int not null check (period_month between 1 and 12),
    status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    submitted_at      timestamptz not null default now(),
    admin_note        text default '',
    resolved_by       uuid references hr_employees(id),
    resolved_at       timestamptz,
    seen_by_employee  boolean not null default false,
    unique (employee_id, period_year, period_month)
);

create index if not exists idx_hr_payslip_approvals_employee on hr_payslip_approvals (employee_id);
create index if not exists idx_hr_payslip_approvals_status on hr_payslip_approvals (status);

alter table hr_payslip_approvals enable row level security;

-- Same convention as every other hr_* table — no RLS policies; access is
-- enforced entirely in the backend (see auth.require_permission).
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('payslip_approvals.manage', 'Approve or reject HR team payslip submissions', false)
on conflict (permission_key) do nothing;
