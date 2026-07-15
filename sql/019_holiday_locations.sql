-- JADE HR — store-wise holiday calendar, configurable early-closing time,
-- and an "anniversary" (informational, non-attendance-affecting) entry type.
--
-- `location` is nullable: NULL = applies to every location; a city name
-- ("Mumbai", "Delhi", "Ahmedabad") fuzzy-matches any employee whose
-- location contains that city; "HQ" matches Madhu Estate, Mumbai
-- specifically (head office, distinct from the other Mumbai store).
-- These are matched in backend/payroll.py, not enforced by a DB constraint,
-- since the set of valid locations already isn't DB-constrained elsewhere
-- (hr_employees.location is free text too).

alter table hr_holidays add column if not exists location text;
alter table hr_holidays add column if not exists close_time time;

alter table hr_holidays drop constraint if exists hr_holidays_holiday_date_key;

alter table hr_holidays drop constraint if exists hr_holidays_day_type_check;
alter table hr_holidays add constraint hr_holidays_day_type_check
    check (day_type in ('closed', 'open_statutory', 'open_till_4pm', 'open_normal', 'anniversary'));

-- The 9 rows already in the table are exactly Delhi's calendar (entered
-- before per-location tracking existed) — tag them as such rather than
-- letting them keep applying company-wide.
update hr_holidays set location = 'Delhi' where location is null;

update hr_holidays set close_time = '16:00' where day_type = 'open_till_4pm';

-- Mumbai's calendar — differs from Delhi on Republic Day (paid-open, not
-- closed) and adds Ganesh Chaturthi.
insert into hr_holidays (holiday_date, description, day_type, remarks, location, close_time) values
    ('2026-01-01', 'New Year''s Day',   'closed',         'Store remain closed',                'Mumbai', null),
    ('2026-01-26', 'Republic Day',      'open_statutory', 'Store remain opened (Statutory Pay)', 'Mumbai', null),
    ('2026-03-04', 'Holi',              'closed',         'Store remain closed',                'Mumbai', null),
    ('2026-05-01', 'Labour Day',        'open_statutory', 'Store remain opened (Statutory Pay)', 'Mumbai', null),
    ('2026-08-15', 'Independence Day',  'open_statutory', 'Store remain opened (Statutory Pay)', 'Mumbai', null),
    ('2026-09-14', 'Ganesh Chaturthi',  'closed',         'Store remain closed',                'Mumbai', null),
    ('2026-10-02', 'Gandhi Jayanti',    'open_statutory', 'Store remain opened (Statutory Pay)', 'Mumbai', null),
    ('2026-11-08', 'Diwali',            'closed',         'Store remain closed',                'Mumbai', null),
    ('2026-12-25', 'Christmas Day',     'open_till_4pm',  'Store remain opened till 4pm',        'Mumbai', '16:00'),
    ('2026-12-31', 'New Year''s Eve',   'open_till_4pm',  'Store remain opened till 4pm',        'Mumbai', '16:00');

-- Ahmedabad's calendar — adds Uttarayan, and several days are plain open
-- (no statutory-pay note in the source sheet) rather than open_statutory.
insert into hr_holidays (holiday_date, description, day_type, remarks, location, close_time) values
    ('2026-01-01', 'New Year''s Day',   'closed',        'Store remain closed', 'Ahmedabad', null),
    ('2026-01-14', 'Uttarayan',         'closed',        'Store remain closed', 'Ahmedabad', null),
    ('2026-01-26', 'Republic Day',      'open_normal',   'Store remain opened', 'Ahmedabad', null),
    ('2026-03-04', 'Holi',              'closed',        'Store remain closed', 'Ahmedabad', null),
    ('2026-05-01', 'Labour Day',        'open_normal',   'Store remain opened', 'Ahmedabad', null),
    ('2026-08-15', 'Independence Day',  'open_normal',   'Store remain opened', 'Ahmedabad', null),
    ('2026-10-02', 'Gandhi Jayanti',    'open_normal',   'Store remain opened', 'Ahmedabad', null),
    ('2026-11-08', 'Diwali',            'closed',        'Store remain closed', 'Ahmedabad', null),
    ('2026-12-25', 'Christmas Day',     'open_till_4pm', 'Store remain opened till 4pm', 'Ahmedabad', '16:00'),
    ('2026-12-31', 'New Year''s Eve',   'open_till_4pm', 'Store remain opened till 4pm', 'Ahmedabad', '16:00');
