-- Restricts the Attendance Sheet, Punctuality Calculator and Late-Working
-- Safety reports to a specific named list of HR staff, and nobody else.
-- These 3 reports previously rode on the general 'attendance.view' /
-- 'payroll.view' permissions — 'attendance.view' defaults TRUE for every HR
-- login, so in practice every HR user could already see them, including the
-- Late-Working Safety report (which lists specific women employees' actual
-- movements/timings — sensitive by nature). That default can't simply be
-- flipped off: 'attendance.view' also gates the Quarter Red Card list
-- (routers/late_policy.py's _quarter_status) and a Dashboard widget, neither
-- of which this request touches. So this is its own dedicated permission
-- key instead, defaulting to false for everyone, granted only via explicit
-- per-person overrides below — same override mechanism as every other
-- hr_permissions row, so Accounts can add/remove people later from the
-- normal Permissions admin page without another migration.
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('attendance.restricted_reports', 'Attendance Sheet, Punctuality Calculator & Late-Working Safety reports (named HR staff only)', false)
on conflict (permission_key) do nothing;

-- Explicit grants — Laki Gupta (14591), Neha Stalin (14760), Nimit Bavishi
-- (14456), Saisha Jain (14803), Vaishali Gajane (14763), per the user's
-- named list on 2026-08-25. Nobody else has this permission by default.
insert into hr_permission_overrides (employee_id, permission_key, granted)
select id, 'attendance.restricted_reports', true
from hr_employees
where employee_code in ('14591', '14760', '14456', '14803', '14763')
on conflict (employee_id, permission_key) do update set granted = true, updated_at = now();
