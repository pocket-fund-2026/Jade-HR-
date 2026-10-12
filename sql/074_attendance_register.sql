-- Imported attendance register (2026-10-12). A pay period's attendance can be
-- loaded EXACTLY as Accounts/HR calculated it (e.g. the HQ Sept 2026 sheet:
-- 23 Aug - 22 Sep). When an employee has a register row for every day of a
-- pay period, payroll uses the sheet's per-day credit as the paid-day count
-- and its late counter as the late marks, instead of re-deriving them from
-- raw punches. Periods without a full register are untouched.
create table if not exists hr_attendance_register (
    id           uuid primary key default gen_random_uuid(),
    employee_id  uuid not null references hr_employees(id) on delete cascade,
    date         date not null,
    shift_code   text not null,            -- P, A, WO, WOP, H as in the sheet
    first_in     time,
    last_out     time,
    work_hours   numeric(5,2) not null default 0,
    ot_hours     numeric(5,2) not null default 0,
    credit       numeric(4,2) not null,    -- payable day credit: 1, 0.75, 0.5, 0.25, 0
    late_count   int,                      -- the sheet's running late counter on that day, if any
    remark       text not null default '',
    source       text not null default 'sheet',
    created_at   timestamptz not null default now(),
    unique (employee_id, date)
);
create index if not exists idx_attendance_register_date on hr_attendance_register (date);
alter table hr_attendance_register enable row level security;
