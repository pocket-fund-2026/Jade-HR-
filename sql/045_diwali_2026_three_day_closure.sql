-- Diwali 2026 is a single day in the DB (8 Nov, a Sunday) from 019. Matching
-- the 3-consecutive-day closure the user's 2025 holiday list already used
-- around Diwali (21-23 Oct 2025), extend 2026 to the same 3-day window
-- around the real main day (8 Nov, confirmed): Chhoti Diwali (7 Nov, Sat),
-- Diwali/Lakshmi Puja (8 Nov, Sun, already present), Govardhan Puja (9 Nov,
-- Mon). Same three cities as the existing 8 Nov rows. Idempotent.
insert into hr_holidays (holiday_date, description, day_type, location)
select v.holiday_date, v.description, 'closed', v.location
from (values
    ('2026-11-07'::date, 'Diwali (Chhoti Diwali)', 'Ahmedabad'),
    ('2026-11-07'::date, 'Diwali (Chhoti Diwali)', 'Delhi'),
    ('2026-11-07'::date, 'Diwali (Chhoti Diwali)', 'Mumbai'),
    ('2026-11-09'::date, 'Diwali (Govardhan Puja)', 'Ahmedabad'),
    ('2026-11-09'::date, 'Diwali (Govardhan Puja)', 'Delhi'),
    ('2026-11-09'::date, 'Diwali (Govardhan Puja)', 'Mumbai')
) as v(holiday_date, description, location)
where not exists (
    select 1 from hr_holidays h
    where h.holiday_date = v.holiday_date and h.location = v.location
);
