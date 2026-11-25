-- Geotag photo check-in extended from market visits to ALL movement between
-- locations (HR meeting 25 Nov 2026): staff clock out at the office, check in at
-- the store/factory with a geotagged photo, check out again on leaving. Each
-- check-in now says WHERE it was. The existing hr_market_visits table is reused;
-- the code works without these columns (it just omits the place) until applied.
alter table hr_market_visits add column if not exists place text not null default '';
alter table hr_market_visits add column if not exists place_type text not null default 'market'
    check (place_type in ('market', 'store', 'factory', 'office', 'other'));
create index if not exists idx_hr_market_visits_employee_captured on hr_market_visits (employee_id, captured_at);
