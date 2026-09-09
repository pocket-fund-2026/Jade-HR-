-- Permission gate for the new Careers section (routers/careers.py), which
-- proxies jade-careers' own admin API (job postings + applicants) into the
-- JADE HR console. Accounts always passes (CONSOLE_ROLES bypass); hr gets it
-- on by default like most other sections, toggleable per-person via Team
-- Access same as everything else.
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('careers.manage', 'Manage Careers (job postings & applicants)', true)
on conflict (permission_key) do nothing;
