-- Emporio was seeded (038) with a 10:30am opening time inherited from the old
-- hardcoded SHIFT_TIMINGS array in PolicyDocument.jsx — every other store in
-- that array opened at 9:00am and this looks like a long-standing data error
-- that was never questioned, not a genuine Emporio-specific policy. Confirmed
-- correction: Emporio opens at 9:00am like the rest.
update hr_store_timings set opening = '9:00 am' where store = 'Emporio';
