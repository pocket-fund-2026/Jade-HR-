-- Geolock for store check-ins: a check-in at a named store only counts within radius_m of the store.
-- Idempotent. Until this is applied the code uses a built-in list and does NOT enforce (the centre is unconfirmed).
create table if not exists hr_geofences (
    id               uuid primary key default gen_random_uuid(),
    name             text not null unique,
    place_type       text not null default 'store',
    address          text not null default '',
    latitude         double precision,
    longitude        double precision,
    radius_m         integer not null default 100 check (radius_m between 20 and 1000),
    center_confirmed boolean not null default false,  -- the lock only enforces once someone has confirmed the centre
    is_active        boolean not null default true,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);
-- Provisional centre (the Ballard Estate area from OpenStreetMap). NOT exact enough for a 100 m lock:
-- set the real point from the Geofences panel on the Market Visits page, which confirms it.
insert into hr_geofences (name, address, latitude, longitude, radius_m, center_confirmed)
values ('Ballard Estate, Mint Road', '128, Mint Rd, Ballard Estate, Fort, Mumbai, Maharashtra 400001', 18.9366512, 72.8391325, 100, false)
on conflict (name) do nothing;
alter table hr_market_visits add column if not exists geofence_id uuid references hr_geofences(id);
alter table hr_market_visits add column if not exists distance_m integer;
alter table hr_market_visits add column if not exists geo_verified boolean;
