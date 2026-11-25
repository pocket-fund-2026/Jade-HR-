-- Night work: punch-out can be on a later calendar date than punch-in.
-- Idempotent. The code works without it (same-day times only) until applied.
alter table hr_attendance_disputes add column if not exists claimed_out_date date;
alter table hr_attendance_overrides add column if not exists last_out_date date;
-- Work-related absence: optional punch-in / punch-out date and time.
alter table hr_absence_requests add column if not exists punch_in_date date;
alter table hr_absence_requests add column if not exists punch_in_time time;
alter table hr_absence_requests add column if not exists punch_out_date date;
alter table hr_absence_requests add column if not exists punch_out_time time;
-- Department heads (hr_employee_profile.head_of_department already exists; set it from Data Readiness / the API).
