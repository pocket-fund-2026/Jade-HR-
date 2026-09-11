-- Salary hold for unapproved absence (Laki, 10 Sept 2026): a run of MORE
-- THAN 5 consecutive unapproved absent days puts the employee's salary into
-- a "hold" status and notifies Rushikesh (Accounts) + the HR team. Mirrors
-- the offer letter's own continuous-absence rule ("absence from work for 5
-- days and above... considered as terminated, except where you have sought
-- approval"), so it's the consecutive run that counts, not scattered days.
--
-- "Unapproved" needs no separate flag: payroll.py already resolves approved
-- leave to status 'leave' and WFH to 'wfh', so a day left as 'absent' IS an
-- unapproved absence (weekly-offs and closed holidays are their own statuses
-- too). See routers/payroll.py's absence_hold_scan.
--
-- The hold is never released automatically — HR/Accounts clears it from the
-- employee record once the absence is explained, so a returning employee
-- can't silently un-hold themselves just by punching in again.
-- Paste into the Supabase SQL editor of the existing project (run once).

alter table hr_employee_profile add column if not exists salary_hold boolean not null default false;
alter table hr_employee_profile add column if not exists salary_hold_reason text default '';
alter table hr_employee_profile add column if not exists salary_hold_since date;

create index if not exists idx_hr_employee_profile_salary_hold
    on hr_employee_profile (salary_hold) where salary_hold;
