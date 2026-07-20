-- JADE HR — HR team was unable to see the Onboarding review queue at all:
-- 'onboarding.manage' was seeded with hr_can_access = false in
-- 025_onboarding_submissions.sql and no per-employee override ever granted
-- it to any of the hr-role accounts. HR requested access to the onboarding
-- page directly; the salary/bank-detail leak on the submissions endpoint
-- was already fixed independently (GET /api/onboarding/submissions/{id}
-- now strips those fields unless the caller also has salary.view), so
-- there's no financial-data exposure risk in granting this by default.
-- Paste into the Supabase SQL editor of the existing project (run once).
update hr_permissions set hr_can_access = true where permission_key = 'onboarding.manage';
