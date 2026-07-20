-- JADE HR — Attendance export for HR (separate from payroll.view, which HR
-- lacks by default since it also exposes OT amounts/pay figures). Lets HR
-- team members view/export the Attendance Sheet report without unlocking
-- any payroll figures.
-- Paste into the Supabase SQL editor of the existing project (run once).
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('attendance.view', 'View & export the Attendance Sheet (no payroll figures)', true)
on conflict (permission_key) do nothing;
