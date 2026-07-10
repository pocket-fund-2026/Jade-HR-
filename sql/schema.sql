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
    role                    text not null default 'employee' check (role in ('accounts', 'hr', 'employee')),
    is_active               boolean not null default true,
    failed_login_count      int not null default 0,
    locked_until            timestamptz,
    requires_selfie_checkin boolean not null default false,
    weekly_off_day          int not null default 6 check (weekly_off_day between 0 and 6), -- 0=Mon .. 6=Sun
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

-- Admin-approved correction for a specific employee-day. Consulted by the
-- payroll engine ahead of raw punches, so approving a dispute actually
-- changes attendance/OT, not just a status label.
create table if not exists hr_attendance_overrides (
    id               uuid primary key default gen_random_uuid(),
    employee_id      uuid not null references hr_employees(id) on delete cascade,
    date             date not null,
    status_override  text not null check (status_override in ('present', 'absent', 'half_day')),
    first_in         time,
    last_out         time,
    note             text default '',
    created_by       uuid references hr_employees(id),
    created_at       timestamptz not null default now(),
    unique (employee_id, date)
);

-- Employee-raised "I forgot to punch in/out" (or other) reports. Approving
-- one writes an hr_attendance_overrides row for that day.
create table if not exists hr_attendance_disputes (
    id            uuid primary key default gen_random_uuid(),
    employee_id   uuid not null references hr_employees(id) on delete cascade,
    date          date not null,
    issue_type    text not null check (issue_type in ('missed_clock_in', 'missed_clock_out', 'both', 'other')),
    claimed_in    time,
    claimed_out   time,
    reason        text not null,
    status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    admin_note    text default '',
    resolved_by   uuid references hr_employees(id),
    resolved_at   timestamptz,
    seen_by_employee boolean not null default false,
    created_at    timestamptz not null default now()
);

create index if not exists idx_hr_disputes_status on hr_attendance_disputes (status, created_at desc);

-- Employee-requested leave. Fixed annual allocations (12 casual / 12 sick /
-- 15 earned, unpaid unlimited) are enforced in code, not a balances table —
-- "used" is computed from approved requests in the current year.
create table if not exists hr_leave_requests (
    id                uuid primary key default gen_random_uuid(),
    employee_id       uuid not null references hr_employees(id) on delete cascade,
    leave_type        text not null check (leave_type in ('casual', 'sick', 'earned', 'unpaid', 'other')),
    start_date        date not null,
    end_date          date not null,
    reason            text not null,
    status            text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    admin_note        text default '',
    resolved_by       uuid references hr_employees(id),
    resolved_at       timestamptz,
    seen_by_employee  boolean not null default false,
    created_at        timestamptz not null default now(),
    check (end_date >= start_date)
);

create index if not exists idx_hr_leave_requests_status on hr_leave_requests (status, created_at desc);
create index if not exists idx_hr_leave_requests_employee on hr_leave_requests (employee_id, start_date);

-- One row per togglable admin-console capability. hr_can_access governs the
-- 'hr' role only — 'accounts' always has full access and is the only role
-- that can write to this table (enforced in the backend, not RLS, same as
-- every other hr_* table).
create table if not exists hr_permissions (
    permission_key  text primary key,
    label           text not null,
    hr_can_access   boolean not null default true,
    updated_by      uuid references hr_employees(id),
    updated_at      timestamptz not null default now()
);

insert into hr_permissions (permission_key, label, hr_can_access) values
    ('employees.view',   'View employee directory',                                    true),
    ('employees.manage', 'Create / edit / deactivate employees',                       true),
    ('salary.view',      'View salary figures (Basic/HRA/Conveyance/Other, payslips)',  false),
    ('salary.edit',      'Edit salary structure / bulk salary import',                  false),
    ('payroll.view',     'View Payroll & OT section and payroll figures on Dashboard',  false),
    ('disputes.manage',  'View & resolve attendance disputes',                          true),
    ('leave.manage',     'View & resolve leave requests',                               true),
    ('biometric.view',   'View biometric sync status/log',                              true)
on conflict (permission_key) do nothing;

-- Extends the employee record with the full HRMS-style profile fields shown
-- on the admin "Details" page: Personal / Official / Dates / Communication /
-- Job Profile / Compliances / Other Details, plus a free-form UDF list.
-- hr_employees itself keeps the fields it already had (name, code, location,
-- department, designation, salary, role, password) — this table is a 1:1
-- extension, not a replacement.
create table if not exists hr_employee_profile (
    employee_id                uuid primary key references hr_employees(id) on delete cascade,

    -- Personal
    gender                     text default '',
    father_name                text default '',
    mother_name                text default '',
    spouse_name                text default '',
    blood_group                text default '',
    old_employee_code          text default '',
    highest_qualification      text default '',
    employee_type              text default '',
    aadhar_no                  text default '',
    nationality                text default '',
    pan_no                     text default '',
    marital_status             text default '',

    -- Official (company/location/department/designation live on hr_employees)
    company                    text default 'Jade Lifestyles India',
    sub_department             text default '',
    grade                      text default '',
    category                   text default '',
    level                      text default '',
    cost_center                text default '',
    unit                       text default '',
    shift_roster               text default '',
    shift_category             text default '',
    holiday_group              text default '',
    shift_group                text default '',
    ess_role                   text default 'Self',
    head_of_department         boolean not null default false,

    -- Dates (date_of_joining lives on hr_employees)
    date_of_birth               date,
    probation_completion_date   date,
    confirmation_date           date,
    last_promotion_date         date,
    next_promotion_date         date,
    gratuity_date               date,
    transfer_date               date,
    marriage_date               date,
    retirement_date             date,
    contract_start_date         date,
    contract_end_date           date,
    last_reappointment_date     date,
    last_exit_date_rejoinee     date,
    scheduled_exit_date         date,
    exit_date                   date,
    settlement_date             date,
    reason_of_leaving           text default '',
    employee_status             text default 'Active',

    -- Communication (phone/email live on hr_employees; selfie-at-punch is
    -- hr_employees.requires_selfie_checkin, not duplicated here)
    emergency_contact_no        text default '',
    personal_email_id           text default '',
    current_address             text default '',
    permanent_address           text default '',
    freeze_salary                boolean not null default false,
    freeze_reason                text default '',
    mobile_punch                 boolean not null default false,
    mobile_punch_remarks         text default '',
    is_remarks_mandatory         boolean not null default false,
    geo_location_selection       boolean not null default false,
    geo_fencing                  boolean not null default false,
    system_punch                 boolean not null default false,
    sequential_punch_only        boolean not null default false,

    -- Job Profile
    job_profile                  text default '',
    job_description              text default '',

    -- Compliances (PF/ESIC/PT/EPS/LWF)
    pf_registration               text default '',
    pf_applicable                 boolean not null default false,
    pf_no                         text default '',
    eps_applicable                boolean not null default false,
    uan_no                        text default '',
    epf_join_date                 date,
    eps_join_date                 date,
    pf_gross_limit                numeric(12,2) not null default 15000,
    eps_exit_date                 date,
    vpf_amount                    numeric(12,2) not null default 0,
    esic_registration             text default '',
    esic_applicable                boolean not null default false,
    esic_no                        text default '',
    dispensary_name                text default '',
    pt_registration                 text default '',
    pt_applicable                   boolean not null default false,
    lwf_registration                text default '',
    lwf_applicable                  boolean not null default false,

    -- Other Details
    identification_mark             text default '',
    is_senior_citizen               boolean not null default false,
    is_super_senior_citizen         boolean not null default false,
    severe_disability               boolean not null default false,
    severe_disability_details       text default '',

    updated_at                      timestamptz not null default now()
);

-- Free-form "User Defined Fields" list — arbitrary name/value pairs per
-- employee (Source, Referred By, Resignation Date, etc. are examples, not a
-- fixed set), ordered by position for stable display.
create table if not exists hr_employee_udf (
    id            uuid primary key default gen_random_uuid(),
    employee_id   uuid not null references hr_employees(id) on delete cascade,
    udf_name      text not null default '',
    udf_value     text not null default '',
    position      int not null default 0,
    created_at    timestamptz not null default now()
);

create index if not exists idx_hr_employee_udf_employee on hr_employee_udf (employee_id, position);

-- Salary Structure (CTC breakdown, versioned by effective date). Manual
-- Entry (Prorata) is what the officer types in; Earning/Deductions/Others
-- (Calculated) are the full line-item breakdown for this effective period.
-- Total Earnings/Deductions/Net Salary/CTC Monthly/CTC Yearly are computed
-- server-side at save time (see backend/routers/salary_structure.py) and
-- stored as a snapshot — so a later formula change never silently rewrites
-- a past payroll-relevant figure.
create table if not exists hr_salary_structure (
    id                              uuid primary key default gen_random_uuid(),
    employee_id                     uuid not null references hr_employees(id) on delete cascade,
    effective_date                  date not null,

    -- Manual Entry (Prorata)
    me_basic                        numeric(12,2) not null default 0,
    me_hra                          numeric(12,2) not null default 0,
    me_conv                         numeric(12,2) not null default 0,
    me_other_allow                  numeric(12,2) not null default 0,
    me_monthly_bonus                numeric(12,2) not null default 0,
    me_retention                    numeric(12,2) not null default 0,
    me_incentive                    numeric(12,2) not null default 0,

    -- Earning (Calculated)
    earn_basic                      numeric(12,2) not null default 0,
    earn_hra                        numeric(12,2) not null default 0,
    earn_conv                       numeric(12,2) not null default 0,
    earn_other_allow                numeric(12,2) not null default 0,
    earn_ot_amt                     numeric(12,2) not null default 0,
    earn_arrear                     numeric(12,2) not null default 0,
    earn_bonus                      numeric(12,2) not null default 0,
    earn_leave_encash               numeric(12,2) not null default 0,
    earn_monthly_bonus              numeric(12,2) not null default 0,
    earn_performance_linked_pay     numeric(12,2) not null default 0,
    earn_retention                  numeric(12,2) not null default 0,
    earn_incentive                  numeric(12,2) not null default 0,
    earn_ctc                        numeric(12,2) not null default 0,
    earn_total_arr                  numeric(12,2) not null default 0,

    -- Deductions (Calculated)
    ded_pf                          numeric(12,2) not null default 0,
    ded_pt                          numeric(12,2) not null default 0,
    ded_vpf                         numeric(12,2) not null default 0,
    ded_esic                        numeric(12,2) not null default 0,
    ded_tds                         numeric(12,2) not null default 0,
    ded_loan                        numeric(12,2) not null default 0,
    ded_advance                     numeric(12,2) not null default 0,
    ded_loan_int                    numeric(12,2) not null default 0,
    ded_lwf                         numeric(12,2) not null default 0,
    ded_other_ded                   numeric(12,2) not null default 0,
    ded_salary_advance               numeric(12,2) not null default 0,
    ded_pf_arrear                    numeric(12,2) not null default 0,

    -- Others (Calculated) — employer-side statutory wages/contributions
    oth_pt_wages                     numeric(12,2) not null default 0,
    oth_lwf_wages                    numeric(12,2) not null default 0,
    oth_eps_wages                    numeric(12,2) not null default 0,
    oth_eps                          numeric(12,2) not null default 0,
    oth_epf                          numeric(12,2) not null default 0,
    oth_edli_charges                 numeric(12,2) not null default 0,
    oth_pf_admin_charges             numeric(12,2) not null default 0,
    oth_edli_admin_charges           numeric(12,2) not null default 0,
    oth_esic_wages                   numeric(12,2) not null default 0,
    oth_esic_employer                numeric(12,2) not null default 0,
    oth_pf_wages                     numeric(12,2) not null default 0,
    oth_edli_wages                   numeric(12,2) not null default 0,

    -- Computed snapshot (see backend for formulas)
    total_earnings                   numeric(12,2) not null default 0,
    total_deductions                 numeric(12,2) not null default 0,
    ctc_monthly                      numeric(12,2) not null default 0,
    net_salary                       numeric(12,2) not null default 0,
    ctc_yearly                       numeric(12,2) not null default 0,

    salary_remarks                   text default '',

    created_by                       uuid references hr_employees(id),
    created_at                       timestamptz not null default now(),
    updated_at                       timestamptz not null default now(),

    unique (employee_id, effective_date)
);

create index if not exists idx_hr_salary_structure_employee
    on hr_salary_structure (employee_id, effective_date desc);

-- Default-deny RLS: the backend connects with the service_role key, which
-- bypasses RLS entirely. This only stops the publishable/anon key (exposed
-- client-side) from reading/writing this data — salary figures and password
-- hashes — via Supabase's auto-generated REST API.
alter table hr_employees enable row level security;
alter table hr_biometric_punches enable row level security;
alter table hr_sync_log enable row level security;
alter table hr_attendance_overrides enable row level security;
alter table hr_attendance_disputes enable row level security;
alter table hr_leave_requests enable row level security;
alter table hr_permissions enable row level security;
alter table hr_employee_profile enable row level security;
alter table hr_employee_udf enable row level security;
alter table hr_salary_structure enable row level security;

-- Selfie check-in photos for employees flagged with requires_selfie_checkin
-- (private bucket; only the service_role backend reads/writes it).
insert into storage.buckets (id, name, public)
values ('selfies', 'selfies', false)
on conflict (id) do nothing;
