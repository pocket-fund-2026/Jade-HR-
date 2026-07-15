-- JADE HR — Monthly Bonus / Retention / Incentive on Employee Details > Salary
-- Paste into the Supabase SQL editor of the existing project (run once).
alter table hr_employees
    add column if not exists monthly_bonus numeric(12,2) not null default 0,
    add column if not exists retention     numeric(12,2) not null default 0,
    add column if not exists incentive     numeric(12,2) not null default 0;
