-- JADE HR — Supabase schema
-- Paste into the Supabase SQL editor on a fresh project.

create extension if not exists pgcrypto;

create table if not exists hr_employees (
    id                      uuid primary key default gen_random_uuid(),
    employee_code           text unique not null,       -- must match the biometric device's EmployeeCode
    first_name              text not null,
    last_name               text default '',
    designation             text default '',
    department              text default '',
    location                text not null default 'Madhu Estate, Mumbai',
    date_of_joining         date,
    basic                   numeric(12,2) not null default 0,
    hra                     numeric(12,2) not null default 0,
    conveyance              numeric(12,2) not null default 0,
    other_allowance         numeric(12,2) not null default 0,
    standard_hours_per_day  numeric(4,2) not null default 8,
    phone                   text default '',
    email                   text default '',
    password_hash           text not null,
    role                    text not null default 'employee' check (role in ('admin', 'employee')),
    is_active               boolean not null default true,
    created_at              timestamptz not null default now(),
    updated_at              timestamptz not null default now()
);

create table if not exists hr_biometric_punches (
    id               bigserial primary key,
    employee_code    text not null,
    punch_time       timestamptz not null,
    serial_number    text default '',
    punch_direction  text default '',
    device_location  text not null default 'Madhu Estate, Mumbai',
    created_at       timestamptz not null default now(),
    unique (employee_code, punch_time)
);

create index if not exists idx_hr_punches_employee_time
    on hr_biometric_punches (employee_code, punch_time);

create table if not exists hr_sync_log (
    id            bigserial primary key,
    run_at        timestamptz not null default now(),
    from_date     date,
    to_date       date,
    fetched       int not null default 0,
    inserted      int not null default 0,
    skipped       int not null default 0,
    status        text not null default 'ok',
    error_message text
);
