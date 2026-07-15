-- JADE HR — Bank details for the Bank Transfer Salary report.
-- Paste into the Supabase SQL editor of the existing project (run once).
alter table hr_employee_profile
    add column if not exists bank_name       text default '',
    add column if not exists bank_account_no text default '',
    add column if not exists bank_ifsc       text default '';
