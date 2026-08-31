-- Policy sign-off register (who has/hasn't acknowledged the current policy)
-- was gated on the broad 'employees.view' key, which the 'hr' role gets by
-- default (sql/002) — so any hr-role account, including a team lead who
-- only needed the employee directory, could see it. There is no schema-level
-- distinction between "team lead" and "genuine HR team" in this system —
-- both are plain 'hr'-role accounts differing only by which permissions
-- they hold (see backend/routers/policy_ack.py for the reasoning).
--
-- This key defaults OFF for the 'hr' role, unlike employees.view. Accounts
-- must explicitly grant it (existing Person Overrides mechanism, TeamAccess
-- admin page) to the specific accounts that are genuine HR team members —
-- not a new bespoke toggle, just this permission used like any other.
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('policy.acknowledgements.view', 'View the policy sign-off register (who has/hasn''t acknowledged)', false)
on conflict (permission_key) do nothing;
