-- JADE HR — track consecutive nightly-roster-sync misses so an employee
-- who's been fully removed from SmartOffice (not just marked resigned) for
-- 2+ consecutive runs gets permanently deleted, while a one-off export
-- glitch can't wipe anyone out on a single bad run.
-- Paste into the Supabase SQL editor of the existing project (run once).
alter table hr_employees
    add column if not exists roster_last_seen_at     timestamptz,
    add column if not exists roster_unmatched_streak  int not null default 0;
