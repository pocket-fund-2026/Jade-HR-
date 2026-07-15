-- JADE HR — Employee income-tax declarations (regime choice, HRA/rent,
-- Old-regime deductions) feeding the TDS engine (backend/tds.py).
-- Paste into the Supabase SQL editor of the existing project (run once).

create table if not exists hr_tax_declarations (
    id                    uuid primary key default gen_random_uuid(),
    employee_id           uuid not null references hr_employees(id) on delete cascade,
    financial_year        text not null,  -- e.g. '2026-27' (India FY: 1 Apr - 31 Mar)
    regime                text not null default 'new' check (regime in ('old', 'new')),
    rent_paid_annual      numeric(12,2) not null default 0,
    landlord_pan          text default '',
    section_80c           numeric(12,2) not null default 0,
    section_80d           numeric(12,2) not null default 0,
    home_loan_interest    numeric(12,2) not null default 0,
    other_deductions      numeric(12,2) not null default 0,
    declared_at           timestamptz not null default now(),
    updated_at            timestamptz not null default now(),
    unique (employee_id, financial_year)
);

create index if not exists idx_hr_tax_declarations_employee on hr_tax_declarations (employee_id, financial_year);

alter table hr_tax_declarations enable row level security;
