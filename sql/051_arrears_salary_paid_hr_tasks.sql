-- JADE HR — three additions:
--   1. hr_arrears: standalone one-off arrear entries, independent of
--      hr_salary_structure (which requires a full CTC revision to exist —
--      almost no employee has one, which is why arrears never got used).
--   2. hr_salary_paid_status: per-employee/per-month "salary paid" checkmark
--      for the new Salary Paid Report.
--   3. hr_tasks: a small HR-team-only task list (see backend/auth.py's
--      require_hr_role — Accounts deliberately does NOT get this one).
-- Paste into the Supabase SQL editor of the existing project (run once).

create table if not exists hr_arrears (
    id              uuid primary key default gen_random_uuid(),
    employee_id     uuid not null references hr_employees(id) on delete cascade,
    effective_date  date not null,
    arrear_amount   numeric not null,
    remarks         text not null default '',
    created_by      uuid references hr_employees(id),
    created_at      timestamptz not null default now()
);

create index if not exists idx_hr_arrears_employee on hr_arrears (employee_id);
create index if not exists idx_hr_arrears_effective_date on hr_arrears (effective_date);

alter table hr_arrears enable row level security;

create table if not exists hr_salary_paid_status (
    id          uuid primary key default gen_random_uuid(),
    employee_id uuid not null references hr_employees(id) on delete cascade,
    year        int not null,
    month       int not null,
    paid        boolean not null default false,
    marked_by   uuid references hr_employees(id),
    marked_at   timestamptz not null default now(),
    unique (employee_id, year, month)
);

create index if not exists idx_hr_salary_paid_status_period on hr_salary_paid_status (year, month);

alter table hr_salary_paid_status enable row level security;

create table if not exists hr_tasks (
    id           uuid primary key default gen_random_uuid(),
    title        text not null,
    description  text not null default '',
    assigned_to  uuid references hr_employees(id) on delete set null,
    status       text not null default 'open', -- open | done
    due_date     date,
    created_by   uuid references hr_employees(id),
    created_at   timestamptz not null default now(),
    completed_at timestamptz
);

create index if not exists idx_hr_tasks_status on hr_tasks (status);
create index if not exists idx_hr_tasks_assigned_to on hr_tasks (assigned_to);

alter table hr_tasks enable row level security;
