-- Supersedes sql/036: the user asked to widen access from the 5 named
-- individuals to the whole HR team. Flips the role-wide default on instead
-- of adding more per-person overrides — every 'hr' console login now gets
-- this permission by default. The 5 explicit overrides from sql/036 are
-- left in place (redundant but harmless now that the default matches them)
-- rather than deleted, so a future narrowing back to specific people is a
-- clean default-flip again without needing to re-add anyone.
update hr_permissions
set hr_can_access = true,
    label = 'Attendance Sheet, Punctuality Calculator & Late-Working Safety reports',
    updated_at = now()
where permission_key = 'attendance.restricted_reports';
