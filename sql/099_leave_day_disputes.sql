-- Employees can dispute a leave day ('leave'): e.g. marked on leave but worked.
-- Apply to the PRIMARY first, then mirror to Supabase.
alter table hr_attendance_disputes drop constraint if exists hr_attendance_disputes_issue_type_check;
alter table hr_attendance_disputes add constraint hr_attendance_disputes_issue_type_check
  check (issue_type in ('missed_clock_in','missed_clock_out','both','late_coming','weekly_off','leave','other'));
