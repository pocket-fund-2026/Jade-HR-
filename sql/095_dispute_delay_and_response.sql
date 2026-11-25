-- Disputes: a detailed reason for filing late, and an HR response on any dispute.
-- Idempotent. The code works without it (the delay reason is folded into the dispute's own
-- reason text and an HR response is appended to the decision note) until it is applied.
alter table hr_attendance_disputes add column if not exists delay_reason text;
alter table hr_attendance_disputes add column if not exists hr_response text;
alter table hr_attendance_disputes add column if not exists hr_response_by uuid references hr_employees(id);
alter table hr_attendance_disputes add column if not exists hr_response_at timestamptz;
