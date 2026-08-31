-- Company-wide (location = NULL) 2025 holiday calendar, so the "2025
-- (Retail, Corporate & Factory)" policy tab can read this year live from
-- /api/holidays instead of a hardcoded table too. Source sheet gave no
-- per-city breakdown for 2025 (unlike the richer 2026 rows already in
-- 019_holiday_locations.sql), so these apply everywhere. Guarded with
-- NOT EXISTS rather than a unique constraint, matching how 019 already
-- allows multiple location-scoped rows per date.
insert into hr_holidays (holiday_date, description, day_type, remarks, location)
select v.holiday_date, v.description, v.day_type, v.remarks, null
from (values
    ('2025-01-01'::date, 'New Year',                    'closed',       ''),
    ('2025-01-26'::date, 'Republic Day',                 'closed',       ''),
    ('2025-03-14'::date, 'Holi – Mumbai',                 'closed',       ''),
    ('2025-03-30'::date, 'Gudi Padwa',                    'closed',       ''),
    ('2025-05-01'::date, 'Labour Day',                    'closed',       ''),
    ('2025-08-15'::date, 'Independence Day',              'closed',       ''),
    ('2025-08-27'::date, 'Ganesh Chaturthi',               'closed',       ''),
    ('2025-10-02'::date, 'Gandhi Jayanti & Dussehra',      'closed',       ''),
    ('2025-10-21'::date, 'Diwali',                         'closed',       ''),
    ('2025-10-22'::date, 'Diwali',                         'closed',       ''),
    ('2025-10-23'::date, 'Diwali',                         'closed',       '')
) as v(holiday_date, description, day_type, remarks)
where not exists (
    select 1 from hr_holidays h
    where h.holiday_date = v.holiday_date and h.location is null
);
