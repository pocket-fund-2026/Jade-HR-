-- HR meeting 25 Sept 2026: "enable both check-in and check-out ... HR
-- controls who gets this access" — mirrors market_visit_checkin_enabled
-- (047_market_visits.sql) as a distinct per-employee opt-in for check-out,
-- and tags each hr_market_visits row with which kind it is. An employee who
-- returns to the office after a market visit is still captured by the
-- ordinary biometric punch, not this flow — this is only for a visit that
-- ends away from the office.
alter table hr_employees add column if not exists market_visit_checkout_enabled boolean not null default false;
alter table hr_market_visits add column if not exists visit_type text not null default 'check_in'
    check (visit_type in ('check_in', 'check_out'));
