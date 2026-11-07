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
-- Invoice management: vendor submissions via a public link -> automatic
-- verification -> approval -> accounting notified -> paid, with a full audit
-- trail. Idempotent.
create sequence if not exists hr_invoice_ref_seq start 5001;

create table if not exists hr_invoices (
    id                  uuid primary key default gen_random_uuid(),
    reference_no        bigint not null unique default nextval('hr_invoice_ref_seq'),
    -- submitted by the vendor
    vendor_name         text not null,
    vendor_email        text not null,
    vendor_phone        text not null default '',
    invoice_number      text not null,
    amount              numeric(14,2) not null,
    invoice_date        date,
    bill_details        text not null default '',
    attachment_path     text not null,
    attachment_type     text not null default '',
    submitted_at        timestamptz not null default now(),
    -- read out of the attachment, for filtering/analysis (company, number, amount, submitter)
    extracted           jsonb not null default '{}'::jsonb,
    -- workflow
    status              text not null default 'pending_verification'
                        check (status in ('pending_verification', 'verification_rejected', 'verified', 'approved', 'rejected', 'paid')),
    verification_source text not null default 'auto' check (verification_source in ('auto', 'manual')),
    verification_checks jsonb not null default '[]'::jsonb,
    verification_note   text not null default '',
    verified_by         uuid references hr_employees(id) on delete set null,
    verified_at         timestamptz,
    approved_by         uuid references hr_employees(id) on delete set null,   -- approver ID for the audit trail
    approved_at         timestamptz,
    decision_note       text not null default '',
    paid_by             uuid references hr_employees(id) on delete set null,
    paid_at             timestamptz,
    payment_ref         text not null default ''
);
create index if not exists idx_invoices_status on hr_invoices (status, submitted_at desc);
create index if not exists idx_invoices_vendor on hr_invoices (lower(vendor_email), lower(invoice_number));

create table if not exists hr_invoice_events (
    id          bigserial primary key,
    invoice_id  uuid not null references hr_invoices(id) on delete cascade,
    action      text not null,
    actor_id    uuid references hr_employees(id) on delete set null,
    actor_label text not null default '',
    note        text not null default '',
    created_at  timestamptz not null default now()
);
create index if not exists idx_invoice_events_invoice on hr_invoice_events (invoice_id, created_at);

insert into hr_permissions (permission_key, label, hr_can_access) values
    ('invoices.view',    'View vendor invoices and their audit trail', false),
    ('invoices.verify',  'Override invoice verification (pass / reject manually)', false),
    ('invoices.approve', 'Approve or reject verified vendor invoices', false),
    ('invoices.pay',     'Mark approved invoices as paid', false)
on conflict (permission_key) do nothing;

insert into storage.buckets (id, name, public)
values ('invoice-documents', 'invoice-documents', false)
on conflict (id) do nothing;
-- Bank-statement reconciliation for invoices: every outgoing bank line that
-- accounting imports is stored once (line_hash makes re-importing the same
-- statement harmless) and linked to the invoice it settled, if any. Idempotent.
create table if not exists hr_invoice_payments (
    id          uuid primary key default gen_random_uuid(),
    line_hash   text not null unique,
    bank_date   date not null,
    description text not null default '',
    reference   text not null default '',
    amount      numeric(14,2) not null,
    invoice_id  uuid references hr_invoices(id) on delete set null,
    difference  numeric(14,2) not null default 0,   -- bank amount minus invoice amount
    note        text not null default '',
    matched_by  uuid references hr_employees(id) on delete set null,
    matched_at  timestamptz not null default now()
);
create index if not exists idx_invoice_payments_invoice on hr_invoice_payments (invoice_id);
create index if not exists idx_invoice_payments_date on hr_invoice_payments (bank_date desc);

insert into hr_permissions (permission_key, label, hr_can_access) values
    ('invoices.reconcile', 'Reconcile invoices against bank statements', false)
on conflict (permission_key) do nothing;
