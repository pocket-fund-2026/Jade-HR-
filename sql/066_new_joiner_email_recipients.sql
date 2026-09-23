-- HR meeting 25 Sept 2026: "when a joining date is set, an automated email
-- should go to selected HR recipients to create credentials (OMS login,
-- HRMS setup)". HR picks who gets notified (no full console access implied
-- by being on this list) rather than a hardcoded recipient.
create table if not exists hr_new_joiner_email_recipients (
    id            uuid primary key default gen_random_uuid(),
    email         text not null unique,
    label         text not null default '',
    created_at    timestamptz not null default now()
);
