-- JADE HR — Careers acceptance dispatch record.
-- When a Careers applicant is marked "Offer Accepted" / "Hired", the offer letter and the onboarding form link are sent
-- once. One row per applicant (applicant ids come from the separate jade-careers service, so no foreign key) records what
-- went out and when, which is what makes the dispatch idempotent: a part with a sent_at is never sent again except by a
-- person pressing "Resend" on the applicant page.
-- Idempotent. The code degrades gracefully if this has not been applied: automatic sending does nothing (it will not send
-- what it cannot record) and the applicant page shows "not recorded".
-- HA note: apply on the PRIMARY first, then mirror on the Supabase standby (new table: add to the HA replication allowlist).

create table if not exists hr_careers_dispatch (
    application_id      integer primary key,
    offer_sent_at       timestamptz,
    offer_letter_id     uuid,
    onboarding_sent_at  timestamptz,
    attempts            integer not null default 0,
    last_error          text,
    sent_by             text,
    claimed_at          timestamptz,       -- short lock while a send is in progress (5 minutes)
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);
