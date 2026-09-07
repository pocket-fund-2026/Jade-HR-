-- Adds an Insurance field alongside the existing Blood Group + 2 emergency
-- contacts, and backs the new mandatory self-service "Personal Information"
-- gate shown right after policy acknowledgement on login (see
-- routers/personal_info.py). No new table needed — these all already live
-- (or now live) on hr_employee_profile; the gate is enforced the same
-- frontend-only way as the policy acknowledgement gate, so it never blocks
-- headless sync accounts.
alter table hr_employee_profile
    add column if not exists insurance text default '';
