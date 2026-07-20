-- JADE HR — Unified Paid Leave (24/yr), replacing Casual/Sick/Earned as
-- separate types going forward, with a location-based year-end carry-
-- forward: HQ (Madhu Estate, Mumbai) up to 15 days, every other location
-- (retail: Ahmedabad, Mumbai-Pedder Road, Delhi stores, etc.) up to 7 days
-- — anything beyond the cap expires. Historical casual/sick/earned rows are
-- kept, not migrated, for audit continuity: those values stay valid so old
-- requests still display correctly, but the leave-request form no longer
-- offers them going forward — only 'paid' is offered. backend/routers/
-- leave.py treats approved requests of any of the four types as drawing
-- from the same unified pool (needed for the transition year only, so
-- usage already booked under the old type labels isn't double-granted).
-- Paste into the Supabase SQL editor of the existing project (run once).
alter table hr_leave_requests drop constraint if exists hr_leave_requests_leave_type_check;
alter table hr_leave_requests add constraint hr_leave_requests_leave_type_check
    check (leave_type in ('paid', 'casual', 'sick', 'earned', 'unpaid', 'other', 'paternity', 'maternity', 'compassionate', 'comp_off'));

-- Locked opening carry-forward per employee per leave year (calendar year,
-- per JADE HR's confirmed leave-year definition). Computed lazily the first
-- time a given year is read (see leave.py's get_carried_forward()) and never
-- recomputed after that, so it doesn't silently drift if a prior year's
-- leave requests are edited after that year has closed.
create table if not exists hr_leave_balances (
    employee_id      uuid not null references hr_employees(id) on delete cascade,
    leave_year       int not null,
    carried_forward  numeric(5,2) not null default 0,
    locked_at        timestamptz not null default now(),
    primary key (employee_id, leave_year)
);
