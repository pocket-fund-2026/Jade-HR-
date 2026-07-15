-- JADE HR — Payment Mode field on Employee Details, shown on the payslip letterhead
-- Paste into the Supabase SQL editor of the existing project (run once).
alter table hr_employee_profile
    add column if not exists payment_mode text default 'Bank Transfer';
