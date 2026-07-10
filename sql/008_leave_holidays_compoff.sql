-- Corporate Leave & Attendance Policy v1.1 (2025) support:
--   - Company holiday calendar (drives "closed" days being paid, not absent)
--   - Comp-Off ledger (earned by working a weekoff/declared holiday, 120-day validity)
--   - New leave types: paternity (fixed 3), maternity/compassionate (uncapped,
--     admin-managed), comp_off (balance sourced from the ledger, not a flat cap).
--     'earned' keeps its existing DB value/history but is now the code's home
--     for what the policy calls Privilege Leave (PL) — 24/yr, accrued monthly.
--   - Per-employee standard working days/month, overriding the pay-period-length
--     divisor used for per-day salary (e.g. Nimit Bavishi: 20).

create table if not exists hr_holidays (
    id            uuid primary key default gen_random_uuid(),
    holiday_date  date not null unique,
    description   text not null,
    day_type      text not null default 'closed' check (day_type in ('closed', 'open_statutory', 'open_till_4pm')),
    remarks       text default '',
    created_at    timestamptz not null default now()
);

insert into hr_holidays (holiday_date, description, day_type, remarks) values
    ('2026-01-01', 'New Year''s Day',   'closed',         'Store remain closed'),
    ('2026-01-26', 'Republic Day',      'closed',         'Store remain closed'),
    ('2026-03-04', 'Holi',              'closed',         'Store remain closed'),
    ('2026-05-01', 'Labour Day',        'open_statutory', 'Store remain opened (Statutory Pay)'),
    ('2026-08-15', 'Independence Day',  'open_statutory', 'Store remain opened (Statutory Pay)'),
    ('2026-10-02', 'Gandhi Jayanti',    'open_statutory', 'Store remain opened (Statutory Pay)'),
    ('2026-11-08', 'Diwali',            'closed',         'Store remain closed'),
    ('2026-12-25', 'Christmas Day',     'open_till_4pm',  'Store remain opened till 4pm'),
    ('2026-12-31', 'New Year''s Eve',   'open_till_4pm',  'Store remain opened till 4pm')
on conflict (holiday_date) do nothing;

-- Comp-Off SOP: earned only when an employee works a weekly off or a declared
-- (closed) holiday. Granting is a manual HR action (policy requires validating
-- via biometric/manual log/Zoho/HOD confirmation) — not auto-issued.
create table if not exists hr_comp_off_ledger (
    id            uuid primary key default gen_random_uuid(),
    employee_id   uuid not null references hr_employees(id) on delete cascade,
    earned_date   date not null,
    units         numeric(2,1) not null check (units in (0.5, 1.0)),
    expiry_date   date not null,
    status        text not null default 'available' check (status in ('available', 'used', 'expired')),
    used_in_leave_request_id uuid references hr_leave_requests(id),
    granted_by    uuid references hr_employees(id),
    created_at    timestamptz not null default now(),
    unique (employee_id, earned_date)
);

create index if not exists idx_hr_comp_off_employee_status on hr_comp_off_ledger (employee_id, status);

alter table hr_leave_requests drop constraint if exists hr_leave_requests_leave_type_check;
alter table hr_leave_requests add constraint hr_leave_requests_leave_type_check
    check (leave_type in ('casual', 'sick', 'earned', 'unpaid', 'other', 'paternity', 'maternity', 'compassionate', 'comp_off'));

alter table hr_employees
    add column if not exists standard_working_days_per_month numeric(4,1);

alter table hr_holidays enable row level security;
alter table hr_comp_off_ledger enable row level security;
