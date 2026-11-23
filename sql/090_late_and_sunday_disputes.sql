-- Employees can dispute a late mark ('late_coming') or an unearned Sunday
-- ('weekly_off'); approving the latter writes a 'weekoff' override.
-- Apply to the PRIMARY first, then mirror to Supabase.
alter table hr_attendance_disputes drop constraint if exists hr_attendance_disputes_issue_type_check;
alter table hr_attendance_disputes add constraint hr_attendance_disputes_issue_type_check
  check (issue_type in ('missed_clock_in','missed_clock_out','both','late_coming','weekly_off','other'));
alter table hr_attendance_overrides drop constraint if exists hr_attendance_overrides_status_override_check;
alter table hr_attendance_overrides add constraint hr_attendance_overrides_status_override_check
  check (status_override in ('present','absent','half_day','weekoff'));
