-- JADE HR — Supabase schema
-- Paste into the Supabase SQL editor on a fresh project.

create extension if not exists pgcrypto;

create table if not exists hr_employees (
    id                      uuid primary key default gen_random_uuid(),
    employee_code           text unique not null,       -- must match the biometric device's EmployeeCode
    first_name              text not null,
    last_name               text default '',
    designation             text default '',
    department              text default '',
    location                text not null default 'Madhu Estate, Mumbai',
    date_of_joining         date,
    basic                   numeric(12,2) not null default 0,
    hra                     numeric(12,2) not null default 0,
    conveyance              numeric(12,2) not null default 0,
    other_allowance         numeric(12,2) not null default 0,
    standard_hours_per_day  numeric(4,2) not null default 8,
    phone                   text default '',
    email                   text default '',
    password_hash           text not null,
    role                    text not null default 'employee' check (role in ('admin', 'employee')),
    is_active               boolean not null default true,
    failed_login_count      int not null default 0,
    locked_until            timestamptz,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create table if not exists hr_biometric_punches (
    id               bigserial primary key,
    employee_code    text not null,
    punch_time       timestamptz not null,
    serial_number    text default '',
    punch_direction  text default '',
    device_location  text not null default 'Madhu Estate, Mumbai',
    created_at       timestamptz not null default now(),
    unique (employee_code, punch_time)
);

create index if not exists idx_hr_punches_employee_time
    on hr_biometric_punches (employee_code, punch_time);

create table if not exists hr_sync_log (
    id            bigserial primary key,
    run_at        timestamptz not null default now(),
    from_date     date,
    to_date       date,
    fetched       int not null default 0,
    inserted      int not null default 0,
    skipped       int not null default 0,
    status        text not null default 'ok',
    error_message text
);

-- Admin-approved correction for a specific employee-day. Consulted by the
-- payroll engine ahead of raw punches, so approving a dispute actually
-- changes attendance/OT, not just a status label.
create table if not exists hr_attendance_overrides (
    id               uuid primary key default gen_random_uuid(),
    employee_id      uuid not null references hr_employees(id) on delete cascade,
    date             date not null,
    status_override  text not null check (status_override in ('present', 'absent', 'half_day')),
    first_in         time,
    last_out         time,
    note             text default '',
    created_by       uuid references hr_employees(id),
    created_at       timestamptz not null default now(),
    unique (employee_id, date)
);

-- Employee-raised "I forgot to punch in/out" (or other) reports. Approving
-- one writes an hr_attendance_overrides row for that day.
create table if not exists hr_attendance_disputes (
    id            uuid primary key default gen_random_uuid(),
    employee_id   uuid not null references hr_employees(id) on delete cascade,
    date          date not null,
    issue_type    text not null check (issue_type in ('missed_clock_in', 'missed_clock_out', 'both', 'other')),
    claimed_in    time,
    claimed_out   time,
    reason        text not null,
    status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    admin_note    text default '',
    resolved_by   uuid references hr_employees(id),
    resolved_at   timestamptz,
    created_at    timestamptz not null default now()
);

create index if not exists idx_hr_disputes_status on hr_attendance_disputes (status, created_at desc);

-- Default-deny RLS: the backend connects with the service_role key, which
-- bypasses RLS entirely. This only stops the publishable/anon key (exposed
-- client-side) from reading/writing this data — salary figures and password
-- hashes — via Supabase's auto-generated REST API.
alter table hr_employees enable row level security;
alter table hr_biometric_punches enable row level security;
alter table hr_sync_log enable row level security;
alter table hr_attendance_overrides enable row level security;
alter table hr_attendance_disputes enable row level security;
