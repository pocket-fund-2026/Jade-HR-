-- Team Pulse (Policy Sign-off page, 2026-10-01): who has logged in and
-- when. Nothing recorded logins before this, so tracking starts now; the
-- policy acknowledgement timestamp (which can only happen while logged in)
-- is shown as the last-known activity for anyone with no newer record.

alter table hr_employees add column if not exists last_login_at timestamptz;
alter table hr_employees add column if not exists last_seen_at timestamptz;
alter table hr_employees add column if not exists login_count integer not null default 0;

-- One row per successful sign-in. device is a coarse "Phone"/"Tablet"/
-- "Desktop" + browser label parsed from the User-Agent; no IP is stored.
create table if not exists hr_login_events (
    id            uuid primary key default gen_random_uuid(),
    employee_id   uuid not null references hr_employees(id) on delete cascade,
    at            timestamptz not null default now(),
    device        text not null default '',
    user_agent    text not null default ''
);
create index if not exists idx_hr_login_events_employee_at on hr_login_events (employee_id, at desc);
create index if not exists idx_hr_login_events_at on hr_login_events (at desc);
alter table hr_login_events enable row level security;

-- One row per person per IST day they used the console/app at all (login
-- or any authenticated request), for the 14-day pulse strip.
create table if not exists hr_activity_days (
    employee_id   uuid not null references hr_employees(id) on delete cascade,
    day           date not null,
    primary key (employee_id, day)
);
create index if not exists idx_hr_activity_days_day on hr_activity_days (day);
alter table hr_activity_days enable row level security;
