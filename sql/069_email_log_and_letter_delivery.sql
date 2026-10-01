-- Outbound email audit + letter delivery (2026-10-01).
--
-- Every "Tina at JADE HR" email used to be fire-and-forget: send_email()
-- returned a bool nobody checked and logger.error() output never reached
-- anywhere HR could see, so "the mails aren't reaching anyone" had no
-- trail to follow. hr_email_log records every attempt (sent, failed, or
-- skipped because nobody was configured to receive it) with Resend's
-- message id, so the Email Log console page can look up actual delivery
-- status (delivered / bounced / complained) from Resend.

create table if not exists hr_email_log (
    id            uuid primary key default gen_random_uuid(),
    created_at    timestamptz not null default now(),
    kind          text not null default 'general',   -- leave_submitted, late_digest, letter, test, ...
    to_email      text not null default '',
    cc            text[] not null default '{}',
    subject       text not null default '',
    status        text not null,                     -- sent | failed | skipped
    error         text,
    provider_id   text,                              -- Resend email id, for delivery lookup
    last_event    text,                              -- cached Resend last_event (delivered, bounced, ...)
    letter_id     uuid references hr_generated_letters(id) on delete set null
);

create index if not exists idx_hr_email_log_created on hr_email_log (created_at desc);
create index if not exists idx_hr_email_log_kind on hr_email_log (kind);
alter table hr_email_log enable row level security;

-- Letters can now be emailed straight to the employee from the Letters page.
alter table hr_generated_letters add column if not exists emailed_to text;
alter table hr_generated_letters add column if not exists emailed_at timestamptz;
alter table hr_generated_letters add column if not exists title text;

insert into hr_permissions (permission_key, label, hr_can_access) values
    ('email_log.view', 'View the outbound email log and send test emails', true)
on conflict (permission_key) do nothing;
