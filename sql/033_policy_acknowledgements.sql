-- JADE HR — policy acknowledgement (read & accept) on login.
--
-- Everyone signing into the console must read the company policy documents and
-- acknowledge them before they can use the console; HR/Accounts can then see
-- exactly who has and hasn't signed off.
--
-- Acknowledgements are scoped to a POLICY VERSION (backend/routers/policy_ack.py
-- POLICY_VERSION). Bumping that constant after a material policy change makes
-- every existing row stale, so the whole company is asked to read and accept
-- again — the history of who accepted which version is kept, never overwritten.

create table if not exists hr_policy_acknowledgements (
    id              uuid primary key default gen_random_uuid(),
    employee_id     uuid not null references hr_employees(id) on delete cascade,
    policy_version  text not null,
    -- Which policy documents the person actually opened and read to the end,
    -- e.g. ["late-2026-09", "2026", "2025"] — the console requires all of them
    -- before enabling the Acknowledge button, and storing it means a later
    -- dispute can be answered with what was on screen at the time.
    documents_read  jsonb not null default '[]',
    acknowledged_at timestamptz not null default now(),
    ip_address      text,
    user_agent      text,
    unique (employee_id, policy_version)
);

create index if not exists idx_hr_policy_ack_version on hr_policy_acknowledgements (policy_version);
create index if not exists idx_hr_policy_ack_employee on hr_policy_acknowledgements (employee_id);

alter table hr_policy_acknowledgements enable row level security;
