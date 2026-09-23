-- Permission gate for assigning HR/Accounts console roles to an employee
-- (backend/routers/employees.py's _require_role_grant_allowed). Previously
-- hardcoded to role == "accounts" only, which blocked HR team admins
-- (Nimit, Rushikesh) and the rest of the HR team from doing this. Accounts
-- always passes (CONSOLE_ROLES bypass); hr gets it on by default like most
-- other sections, toggleable per-person via Team Access same as everything
-- else.
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('roles.manage', 'Assign HR/Accounts console roles', true)
on conflict (permission_key) do nothing;
