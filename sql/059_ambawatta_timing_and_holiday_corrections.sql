-- Data corrections from Delhi-store feedback:
--
-- 1. Ambawatta (Mehrauli, Delhi) was being graded against a 10:00 AM shift
--    start (hr_employee_profile.time_slot blank on every Ambawatta employee
--    falls back to payroll.py's DEFAULT_SHIFT_START = 10:00 AM), when the
--    store's actual hours are 11:00 AM - 7:30 PM — so arriving at 10:25 AM
--    (35 minutes before the real shift) still graded as "late" against the
--    wrong assumed start. hr_store_timings.default_time_slot was ALSO wrong
--    (10:00 AM - 6:30 PM) but that field is display-only, never read by
--    payroll grading — the real fix is each employee's own time_slot.
-- 2. Independence Day (15 Aug) and Gandhi Jayanti (2 Oct) were marked
--    open_statutory for Delhi; corrected to closed (Republic Day, 26 Jan,
--    was already closed) — Ambawatta Complex is fully shut on all 3
--    national holidays.
-- 3. Dussehra (Vijayadashami), 20 October 2026, was missing from the 2026
--    holiday calendar entirely — added as a 1-day closed holiday, same
--    locations as the other major festivals (Holi, Ganesh Chaturthi, Diwali).
--
-- Paste into the Supabase SQL editor of the existing project (run once).

-- 1a. New time slot matching Ambawatta's actual hours (none of the existing
-- slots end at 7:30 PM, so reusing "11:00 AM – 8:00 PM" would silently give
-- the wrong closing time to anything that reads it).
insert into hr_time_slots (label, shift_start, sort_order)
values ('11:00 AM – 7:30 PM', '11:00:00', 5)
on conflict (label) do nothing;

-- 1b. Store's display timings + default (display-only, but corrected for consistency).
update hr_store_timings
set opening = '11:00 am', trading = '11:00 am – 7:30 pm', closing = '7:30 pm',
    default_time_slot = '11:00 AM – 7:30 PM'
where store = 'Ambawatta';

-- 1c. The actual fix — every active Ambawatta employee whose time_slot is
-- still blank (i.e. nobody who has an intentional individual override).
update hr_employee_profile p
set time_slot = '11:00 AM – 7:30 PM'
from hr_employees e
where p.employee_id = e.id
  and e.location ilike '%ambawatta%'
  and e.is_active
  and (p.time_slot is null or p.time_slot = '');

-- 1d. A couple of Ambawatta employees (auto-added from a biometric punch,
-- never manually onboarded) have no hr_employee_profile row yet, so the
-- UPDATE above has nothing to match — insert one for them directly.
insert into hr_employee_profile (employee_id, time_slot)
select e.id, '11:00 AM – 7:30 PM'
from hr_employees e
where e.location ilike '%ambawatta%' and e.is_active
  and not exists (select 1 from hr_employee_profile p where p.employee_id = e.id)
on conflict (employee_id) do update set time_slot = excluded.time_slot;

-- 2. Delhi national-holiday full closures.
update hr_holidays
set day_type = 'closed'
where location = 'Delhi' and holiday_date = '2026-08-15' and description = 'Independence Day';

update hr_holidays
set day_type = 'closed'
where location = 'Delhi' and holiday_date = '2026-10-02' and description = 'Gandhi Jayanti';

-- 3. Dussehra 2026, missing from the calendar.
insert into hr_holidays (holiday_date, description, day_type, location)
select '2026-10-20', 'Dussehra', 'closed', loc
from (values ('Mumbai'), ('Delhi'), ('Hyderabad'), ('Ahmedabad')) as locs(loc)
where not exists (
    select 1 from hr_holidays where holiday_date = '2026-10-20' and location = locs.loc
);
