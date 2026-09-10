-- Employee salary-advance/loan request form ("Loan Form New.pdf") — separate
-- from hr_employee_profile.standing_loan_emi (the recurring monthly
-- deduction Accounts sets once a loan is approved and running); this is the
-- intake/approval workflow that precedes it. Same submit -> pending ->
-- approve/reject shape as hr_absence_requests.
-- Paste into the Supabase SQL editor of the existing project (run once).

create table if not exists hr_loan_requests (
    id                        uuid primary key default gen_random_uuid(),
    employee_id               uuid not null references hr_employees(id) on delete cascade,

    -- Snapshot of employee details at submission time, matching
    -- hr_absence_requests' own convention (rather than only joining
    -- hr_employees live).
    department                text default '',
    employee_code             text default '',
    first_name                text default '',
    last_name                 text default '',
    email                     text default '',

    amount                    numeric(10,2) not null,
    reason                    text not null default '',
    repayment_months          int not null default 1,

    guarantor_name            text default '',
    guarantor_employee_code   text default '',
    guarantor_details         text default '',
    pdc_details                text default '',

    status                    text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    admin_note                text default '',
    resolved_by               uuid references hr_employees(id),
    resolved_at               timestamptz,

    created_at                timestamptz not null default now(),
    updated_at                timestamptz not null default now()
);

create index if not exists idx_hr_loan_requests_employee_id on hr_loan_requests (employee_id);
create index if not exists idx_hr_loan_requests_status on hr_loan_requests (status);

alter table hr_loan_requests enable row level security;

insert into hr_permissions (permission_key, label, hr_can_access) values
    ('loans.manage', 'Review employee loan/salary-advance requests and approve/reject them', true)
on conflict (permission_key) do nothing;
