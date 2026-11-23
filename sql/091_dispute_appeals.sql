-- Appeals: an employee (any role) can appeal a rejected attendance dispute once.
-- The appeal is a new dispute row pointing at the original; one appeal per original.
-- Apply to the PRIMARY first, then mirror to Supabase.
alter table hr_attendance_disputes add column if not exists appeal_of uuid references hr_attendance_disputes(id) on delete set null;
create unique index if not exists uq_hr_dispute_one_appeal on hr_attendance_disputes (appeal_of) where appeal_of is not null;
