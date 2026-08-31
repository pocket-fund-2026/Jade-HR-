-- Reverses 042's default-off stance: the user decided HR-role accounts
-- generally (not just per-person overrides for a hand-picked HR subset)
-- should see the policy sign-off register. Idempotent.
update hr_permissions set hr_can_access = true where permission_key = 'policy.acknowledgements.view';
