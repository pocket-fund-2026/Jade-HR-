-- JADE HR — Policy v3 groundwork ("Attendance, Punctuality, Leave & WFH
-- Policy" v2.0, supplied 2026-08-25 to Tina by HQ).
--
-- IMPORTANT: the late-arrival/Yellow-Red-Card/AIP grading itself
-- (backend/payroll.py) is gated behind LATE_POLICY_V3_EFFECTIVE, a
-- deliberate far-future placeholder — this migration's tables are pure
-- schema and do not change any existing payroll output. The doc's own
-- Effective Date field is blank ("To be notified") and it explicitly marks
-- the 0.25/0.50-day pay treatments "subject to applicable law and final
-- payroll/legal validation before implementation" (doc §34) — do not flip
-- LATE_POLICY_V3_EFFECTIVE to a real date without that sign-off.

-- 1. Attendance Improvement Plan (doc §15). Record-keeping only — AIP
--    failure is surfaced to HR, never auto-actioned.
create table if not exists hr_aip_records (
    id              uuid primary key default gen_random_uuid(),
    employee_id     uuid not null references hr_employees(id) on delete cascade,
    duration_days   int  not null check (duration_days in (30, 60)),
    start_date      date not null,
    end_date        date not null,
    status          text not null default 'active' check (status in ('active', 'passed', 'failed')),
    notes           text default '',
    created_by      uuid references hr_employees(id),
    created_at      timestamptz not null default now(),
    closed_by       uuid references hr_employees(id),
    closed_at       timestamptz
);

create index if not exists idx_hr_aip_records_employee on hr_aip_records (employee_id, status);

alter table hr_aip_records enable row level security;

-- 2. Work From Home requests (doc §24-25) — did not exist in jade-hr at all
--    before this. Two independent gates: `status` (Senior Management/HR-Head
--    approval) and `work_completed` (Reporting Manager confirmation) — both
--    must be true before the 50% pay treatment applies, and that payroll
--    wiring itself is deliberately NOT built yet (see routers/wfh.py).
create table if not exists hr_wfh_requests (
    id                            uuid primary key default gen_random_uuid(),
    employee_id                   uuid not null references hr_employees(id) on delete cascade,
    start_date                    date not null,
    end_date                      date not null,
    reason                        text not null default '',
    status                        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    resolved_by                   uuid references hr_employees(id),
    resolved_at                   timestamptz,
    resolution_note               text default '',
    pay_treatment_percent         numeric(5,2),
    work_completed                boolean,
    work_completed_confirmed_by   uuid references hr_employees(id),
    work_completed_confirmed_at   timestamptz,
    completion_note               text default '',
    created_at                    timestamptz not null default now()
);

create index if not exists idx_hr_wfh_requests_employee on hr_wfh_requests (employee_id, status);

alter table hr_wfh_requests enable row level security;

-- 3. Missed-punch verification source (doc §6/§17) — there is no CCTV feed
--    integration; this just records how HR established the time entered on
--    an existing manual attendance-override row.
alter table hr_attendance_overrides add column if not exists verification_source text;
alter table hr_attendance_overrides drop constraint if exists hr_attendance_overrides_verification_source_check;
alter table hr_attendance_overrides add constraint hr_attendance_overrides_verification_source_check
    check (verification_source is null or verification_source in ('cctv', 'system_correction', 'other'));
