-- Free-text Remarks that HR types per employee per day on the Attendance Sheet.
-- Display/export only: unlike hr_attendance_overrides / hr_attendance_register
-- this NEVER changes status, hours, late marks or pay.
-- Apply to the PRIMARY first, then mirror to Supabase (allowlist + cloud_guard trigger for the new table).

create table if not exists hr_attendance_remarks (
    id           uuid primary key default gen_random_uuid(),
    employee_id  uuid not null references hr_employees(id) on delete cascade,
    date         date not null,
    remark       text not null,
    updated_by   uuid references hr_employees(id),
    updated_at   timestamptz not null default now(),
    unique (employee_id, date)
);
create index if not exists idx_attendance_remarks_date on hr_attendance_remarks (date);
alter table hr_attendance_remarks enable row level security;
