-- JADE HR — adds a "Day Off" holiday type.
-- Paste into the Supabase SQL editor (run once).
--
-- Paid identically to 'closed' (see backend/payroll.py's is_closed_holiday
-- check) — a separate label so HR can distinguish a company-granted paid
-- day off from an actual store-closure holiday in the calendar and in
-- reporting, without changing how either is paid.

alter table hr_holidays drop constraint if exists hr_holidays_day_type_check;
alter table hr_holidays add constraint hr_holidays_day_type_check
    check (day_type in ('closed', 'day_off', 'open_statutory', 'open_till_4pm', 'open_normal', 'anniversary'));
