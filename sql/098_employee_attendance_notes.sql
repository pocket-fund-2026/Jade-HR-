-- Employee's own note on one of their attendance days (separate from HR's numeric Remark on the sheet).
-- Idempotent. Until applied, saving a note returns a clear "not set up yet" message.
create table if not exists hr_attendance_employee_notes (
    employee_id uuid not null references hr_employees(id) on delete cascade,
    date        date not null,
    note        text not null,
    updated_at  timestamptz not null default now(),
    primary key (employee_id, date)
);
alter table hr_attendance_employee_notes enable row level security;
