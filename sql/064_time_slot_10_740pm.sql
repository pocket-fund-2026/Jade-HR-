-- New shift time slot, HR meeting 25 Sept 2026: 10:00 AM – 7:40 PM, OT
-- starts strictly after 7:00 PM (see payroll.WEEKDAY_OT_CUTOFF_BY_TIME_SLOT).
-- Adding it here makes it selectable on Employee Details' Time Slot picker
-- immediately, without a backend deploy — register_time_slot() (already
-- called for every hr_time_slots row on startup) also grades late-grace
-- for it correctly the moment it's added.
insert into hr_time_slots (label, shift_start, sort_order) values
    ('10:00 AM – 7:40 PM', '10:00', 5)
on conflict (label) do nothing;
