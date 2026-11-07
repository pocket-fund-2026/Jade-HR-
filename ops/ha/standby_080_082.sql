-- Run this on the SUPABASE STANDBY (SQL editor) after sql/apply_080_082.sql
-- has been run on the office-server primary. Schema only: the permission rows
-- arrive by replication, so do NOT insert data here. Idempotent.

-- 1. The two columns added to an existing replicated table (replay fails without them).
alter table hr_onboarding_submissions add column if not exists custom_values jsonb not null default '{}'::jsonb;
create sequence if not exists hr_onboarding_ref_seq start 1001;
alter table hr_onboarding_submissions add column if not exists reference_no bigint default nextval('hr_onboarding_ref_seq');

-- 2. The new tables (same definitions as the primary).
create table if not exists hr_onboarding_fields (
    id uuid primary key default gen_random_uuid(),
    field_key text not null unique, label text not null,
    field_type text not null default 'text'
        check (field_type in ('text','textarea','number','date','select','checkbox','file')),
    options jsonb not null default '[]'::jsonb, required boolean not null default false,
    section text not null default 'Additional Details', help_text text not null default '',
    sort_order integer not null default 0, is_active boolean not null default true,
    updated_by uuid references hr_employees(id) on delete set null,
    created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create sequence if not exists hr_invoice_ref_seq start 5001;
create table if not exists hr_invoices (
    id uuid primary key default gen_random_uuid(),
    reference_no bigint not null unique default nextval('hr_invoice_ref_seq'),
    vendor_name text not null, vendor_email text not null, vendor_phone text not null default '',
    invoice_number text not null, amount numeric(14,2) not null, invoice_date date,
    bill_details text not null default '', attachment_path text not null, attachment_type text not null default '',
    submitted_at timestamptz not null default now(), extracted jsonb not null default '{}'::jsonb,
    status text not null default 'pending_verification'
        check (status in ('pending_verification','verification_rejected','verified','approved','rejected','paid')),
    verification_source text not null default 'auto' check (verification_source in ('auto','manual')),
    verification_checks jsonb not null default '[]'::jsonb, verification_note text not null default '',
    verified_by uuid references hr_employees(id) on delete set null, verified_at timestamptz,
    approved_by uuid references hr_employees(id) on delete set null, approved_at timestamptz,
    decision_note text not null default '',
    paid_by uuid references hr_employees(id) on delete set null, paid_at timestamptz,
    payment_ref text not null default ''
);
create table if not exists hr_invoice_events (
    id bigserial primary key,
    invoice_id uuid not null references hr_invoices(id) on delete cascade,
    action text not null, actor_id uuid references hr_employees(id) on delete set null,
    actor_label text not null default '', note text not null default '',
    created_at timestamptz not null default now()
);
create table if not exists hr_invoice_payments (
    id uuid primary key default gen_random_uuid(),
    line_hash text not null unique, bank_date date not null,
    description text not null default '', reference text not null default '',
    amount numeric(14,2) not null,
    invoice_id uuid references hr_invoices(id) on delete set null,
    difference numeric(14,2) not null default 0, note text not null default '',
    matched_by uuid references hr_employees(id) on delete set null,
    matched_at timestamptz not null default now()
);

-- 3. Document bucket (uploads are mirrored here and fail without it).
insert into storage.buckets (id, name, public) values ('invoice-documents','invoice-documents',false)
on conflict (id) do nothing;

-- 4. Register the tables for replication and fence app writes like the others.
insert into hr_ha.allowed_tables (name, pk) values
    ('hr_onboarding_fields','{id}'), ('hr_invoices','{id}'),
    ('hr_invoice_events','{id}'), ('hr_invoice_payments','{id}')
on conflict (name) do nothing;
-- COPY the guard trigger exactly as it exists on an existing table first:
--   select pg_get_triggerdef(oid) from pg_trigger
--   where tgrelid='public.hr_workflow_events'::regclass and not tgisinternal;
-- then create the same trigger (named hr_ha_cloud_guard) on each of the four tables above.
