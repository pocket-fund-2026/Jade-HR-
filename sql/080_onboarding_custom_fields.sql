-- Customizable onboarding form: HR-defined extra fields (shown on the public
-- /onboarding/new form after the built-in sections) + a per-submission
-- reference number for tracking. Idempotent.
create table if not exists hr_onboarding_fields (
    id          uuid primary key default gen_random_uuid(),
    field_key   text not null unique,
    label       text not null,
    field_type  text not null default 'text'
                check (field_type in ('text', 'textarea', 'number', 'date', 'select', 'checkbox', 'file')),
    options     jsonb not null default '[]'::jsonb,   -- choices for 'select'
    required    boolean not null default false,
    section     text not null default 'Additional Details',
    help_text   text not null default '',
    sort_order  integer not null default 0,
    is_active   boolean not null default true,
    updated_by  uuid references hr_employees(id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

alter table hr_onboarding_submissions add column if not exists custom_values jsonb not null default '{}'::jsonb;

create sequence if not exists hr_onboarding_ref_seq start 1001;
-- A volatile default backfills existing rows too, so every submission gets a number.
alter table hr_onboarding_submissions add column if not exists reference_no bigint default nextval('hr_onboarding_ref_seq');
create unique index if not exists idx_onboarding_reference_no on hr_onboarding_submissions (reference_no);
