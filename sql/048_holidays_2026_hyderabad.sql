-- Hyderabad had zero 2026 holiday rows despite already being a configured
-- store (hr_store_timings). No employee is currently located there, but the
-- gap is real the moment one is. Mirrors Delhi's open_statutory/closed
-- pattern for national holidays; Ganesh Chaturthi included (widely
-- observed/official in Telangana too), Uttarayan (Ahmedabad-specific) and
-- Gudi Padwa (Maharashtra-specific) excluded as not Telangana festivals.
-- Idempotent.
insert into hr_holidays (holiday_date, description, day_type, location)
select v.holiday_date, v.description, v.day_type, 'Hyderabad'
from (values
    ('2026-01-01'::date, 'New Year''s Day',          'closed'),
    ('2026-01-26'::date, 'Republic Day',              'open_statutory'),
    ('2026-03-04'::date, 'Holi',                       'closed'),
    ('2026-05-01'::date, 'Labour Day',                 'open_statutory'),
    ('2026-08-15'::date, 'Independence Day',           'open_statutory'),
    ('2026-09-14'::date, 'Ganesh Chaturthi',           'closed'),
    ('2026-10-02'::date, 'Gandhi Jayanti',             'open_statutory'),
    ('2026-11-07'::date, 'Diwali (Chhoti Diwali)',     'closed'),
    ('2026-11-08'::date, 'Diwali',                     'closed'),
    ('2026-11-09'::date, 'Diwali (Govardhan Puja)',    'closed'),
    ('2026-12-25'::date, 'Christmas Day',              'open_till_4pm'),
    ('2026-12-31'::date, 'New Year''s Eve',            'open_till_4pm')
) as v(holiday_date, description, day_type)
where not exists (
    select 1 from hr_holidays h
    where h.holiday_date = v.holiday_date and h.location = 'Hyderabad'
);
