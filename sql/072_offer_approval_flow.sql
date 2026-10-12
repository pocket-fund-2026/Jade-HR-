-- Offer letter approval + e-sign flow (2026-10-12).
-- HR issues an offer -> approver (Head-HR) types initials and approves via an
-- emailed link -> candidate gets a link to sign/accept -> signed copy goes to
-- the candidate, team HR, accounts and any extra emails/employee codes HR
-- listed. Employee-code recipients also see it on their dashboard.
alter table hr_generated_letters add column if not exists approval_status text;  -- awaiting_approval | awaiting_candidate | accepted
alter table hr_generated_letters add column if not exists approver_email text;
alter table hr_generated_letters add column if not exists approver_token text;
alter table hr_generated_letters add column if not exists approver_initials text;
alter table hr_generated_letters add column if not exists approved_at timestamptz;
alter table hr_generated_letters add column if not exists candidate_email text;
alter table hr_generated_letters add column if not exists candidate_token text;
alter table hr_generated_letters add column if not exists candidate_signature text;
alter table hr_generated_letters add column if not exists candidate_signed_at timestamptz;
alter table hr_generated_letters add column if not exists notify_recipients text[] not null default '{}';
create unique index if not exists idx_letters_approver_token on hr_generated_letters (approver_token) where approver_token is not null;
create unique index if not exists idx_letters_candidate_token on hr_generated_letters (candidate_token) where candidate_token is not null;

create table if not exists hr_offer_notices (
    id            uuid primary key default gen_random_uuid(),
    letter_id     uuid not null references hr_generated_letters(id) on delete cascade,
    employee_code text not null,
    message       text not null,
    created_at    timestamptz not null default now()
);
create index if not exists idx_offer_notices_code on hr_offer_notices (employee_code, created_at desc);
alter table hr_offer_notices enable row level security;
