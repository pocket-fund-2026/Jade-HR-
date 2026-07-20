-- JADE HR — Authorized signatory + approver fields on Employee Details.
-- Moved off the public onboarding form (an HR-internal detail, not something
-- a new joinee should fill in) onto the employee record itself.
-- Paste into the Supabase SQL editor of the existing project (run once).
alter table hr_employee_profile
    add column if not exists signatory_name        text default '',
    add column if not exists signatory_designation  text default '',
    add column if not exists signatory_email        text default '',
    add column if not exists approver_name          text default '',
    add column if not exists approver_email         text default '';
