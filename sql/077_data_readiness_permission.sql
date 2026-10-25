-- Data Readiness report (read-only): lists employees with missing/inconsistent
-- data, feed freshness and the policy definitions in force. Defaults ON for the
-- 'hr' role like the other register-style reports (see 043); Accounts can turn
-- it off per person via Person Overrides. Idempotent.
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('data_readiness.view', 'View the Data Readiness report (missing data, feed freshness, policy definitions)', true)
on conflict (permission_key) do nothing;
