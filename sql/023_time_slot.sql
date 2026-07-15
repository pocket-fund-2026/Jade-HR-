-- JADE HR — Time Slot field on Employee Details > Official (reference field,
-- shown next to Shift Roster/Category/Group). As of payroll.py's
-- SATURDAY_SHIFT_HOURS (Jul 2026), the "10:00 AM – 6:30 PM" value IS read
-- by payroll.py (shortened Saturday standard) — every other time_slot value
-- remains purely a reference label, uninvolved in late/OT calculation,
-- which otherwise still uses payroll.py's LATE_GRACE/standard_hours_per_day.
-- Paste into the Supabase SQL editor of the existing project (run once).
alter table hr_employee_profile
    add column if not exists time_slot text default '',
    add column if not exists saturday_extended_hours boolean not null default false;
