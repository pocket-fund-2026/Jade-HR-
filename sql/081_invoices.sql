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
