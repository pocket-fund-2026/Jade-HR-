-- Policy comprehension quiz, shown after the read-and-acknowledge gate so
-- people can't just scroll to the bottom and click through without
-- absorbing anything — see routers/policy_ack.py's my_acknowledgement,
-- which now requires a PASSED attempt at the current policy_version (not
-- just the acknowledgement row) before the console gate opens. Every
-- attempt (pass or fail) is kept for the audit trail and for HR's own
-- visibility into where comprehension is weak.
-- Paste into the Supabase SQL editor of the existing project (run once).

create table if not exists hr_policy_quiz_attempts (
    id              uuid primary key default gen_random_uuid(),
    employee_id     uuid not null references hr_employees(id) on delete cascade,
    policy_version  text not null,
    score           int not null,
    total           int not null,
    passed          boolean not null,
    answers         jsonb not null default '[]'::jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists idx_hr_policy_quiz_attempts_employee_version
    on hr_policy_quiz_attempts (employee_id, policy_version);

alter table hr_policy_quiz_attempts enable row level security;
