-- Conditional clauses: a library clause can carry rules over the letter's form
-- fields (all must match). Matching clauses are ticked automatically in the
-- generator; HR can still untick/edit per person. Idempotent.
-- Apply to the PRIMARY first, then mirror to the Supabase standby.
alter table hr_letter_clauses add column if not exists conditions jsonb not null default '[]'::jsonb;
