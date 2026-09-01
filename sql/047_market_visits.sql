-- Geotagged field/market-visit check-ins for staff who visit
-- markets/stores (e.g. sales/BD) -- a visit log, not an attendance
-- mechanism. Mirrors hr_wfh_requests' shape (034_policy_v3.sql): a simple
-- status/reviewer/note pattern, reviewed by the employee's own Reporting
-- Manager (hr_employees.leave_approver_id / hr_employee_profile.reporting_to_id,
-- same dual lookup routers/wfh.py and routers/leave.py already use) or by
-- Accounts/HR. No notes field on the submission itself (kept minimal, per
-- spec) and no geofencing -- lat/lng/accuracy are logged as-is for the
-- record, never verified against a known location.
create table if not exists hr_market_visits (
    id             uuid primary key default gen_random_uuid(),
    employee_id    uuid not null references hr_employees(id) on delete cascade,
    photo_path     text not null,
    latitude       numeric(10, 7) not null,
    longitude      numeric(10, 7) not null,
    accuracy       numeric(10, 2),
    captured_at    timestamptz not null default now(),
    status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    reviewed_by    uuid references hr_employees(id),
    reviewed_at    timestamptz,
    review_note    text default '',
    created_at     timestamptz not null default now()
);

create index if not exists idx_hr_market_visits_employee on hr_market_visits (employee_id, captured_at desc);
create index if not exists idx_hr_market_visits_status on hr_market_visits (status);

alter table hr_market_visits enable row level security;

-- Per-employee opt-in, set by HR/admin -- same pattern as requires_selfie_checkin.
alter table hr_employees add column if not exists market_visit_checkin_enabled boolean not null default false;

-- Review access: Accounts always passes (auth.py short-circuits); this key
-- gates hr-role accounts. Defaults true, unlike wfh.approve -- there is no
-- "Senior Management only" constraint here, this is an ordinary HR-team
-- visibility, same posture as policy.acknowledgements.view ended up at
-- (043_policy_ack_hr_default_on.sql) after the user asked for the whole HR
-- team to have it, not a hand-picked subset. A Reporting Manager sees their
-- own reports' submissions regardless of this permission (routers/market_visits.py).
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('market_visits.review', 'Review field/market-visit check-ins (approve/reject)', true)
on conflict (permission_key) do nothing;
