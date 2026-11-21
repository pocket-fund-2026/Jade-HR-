-- Company-wide "All Requests" page was tied to one employee code (14456). It is now a
-- permission: hr_can_access is FALSE so nobody on the hr role gets it by default; grant it
-- per person in Team Access > Person Overrides. Accounts logins always pass permission checks.
-- Idempotent. The old employee-code check stays as a fallback until the grant below is done.
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('requests.view_all', 'View all leave, absence and dispute requests company-wide (All Requests page)', false)
on conflict (permission_key) do nothing;
