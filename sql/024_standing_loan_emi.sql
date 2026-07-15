-- JADE HR — Standing Loan EMI: a durable, recurring monthly loan deduction
-- on the employee record itself (like Basic/HRA/Monthly Bonus already are),
-- unlike hr_salary_structure's ded_loan which is a one-off figure that only
-- applies to the specific pay period a structure revision is dated in.
-- Paste into the Supabase SQL editor of the existing project (run once).
alter table hr_employees
    add column if not exists standing_loan_emi numeric(12,2) not null default 0;
