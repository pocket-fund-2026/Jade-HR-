-- 2026 holiday list was missing Gudi Padwa. Real 2026 date (verified via web
-- search): Thursday, 19 March 2026. Scoped Mumbai-only, same as the existing
-- Ganesh Chaturthi row -- a Maharashtra festival, not observed in the
-- Delhi/Ahmedabad rows already on file for 2026.
insert into hr_holidays (holiday_date, description, day_type, remarks, location)
select '2026-03-19'::date, 'Gudi Padwa', 'closed', '', 'Mumbai'
where not exists (
    select 1 from hr_holidays
    where holiday_date = '2026-03-19' and location = 'Mumbai'
);
