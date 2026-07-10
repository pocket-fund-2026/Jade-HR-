-- JADE HR — Additional Information box + 2 extra contacts on Employee Details
-- Paste into the Supabase SQL editor of the existing project (run once).
alter table hr_employee_profile
    add column if not exists additional_info text default '',
    add column if not exists additional_contact_1_name text default '',
    add column if not exists additional_contact_1_phone text default '',
    add column if not exists additional_contact_2_name text default '',
    add column if not exists additional_contact_2_phone text default '';
