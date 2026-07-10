-- JADE HR — Leave approval routing
-- Paste into the Supabase SQL editor of the existing project (run once).
--
-- leave_approver_id: who approves this employee's leave requests. Not tied
-- to a console role — any employee referenced here automatically gets a
-- "Team Leave" section in their own self-service portal scoped to just the
-- people who list them, so a department head doesn't need hr/accounts
-- access (which would expose salary/compliance data of every other
-- employee) just to approve their own team's leave.
alter table hr_employees
    add column if not exists leave_approver_id uuid references hr_employees(id);

create index if not exists idx_hr_employees_leave_approver on hr_employees (leave_approver_id);

-- Free-text "who this person reports to" for display — deliberately not a
-- FK, since real org charts have messy values ("Ma'am/Sir", "Dheeral/
-- Dhananjay") that don't resolve to one person.
alter table hr_employee_profile
    add column if not exists reporting_to text default '';
