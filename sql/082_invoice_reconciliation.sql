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
