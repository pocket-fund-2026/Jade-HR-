-- JADE HR — Employee master profile (Details page)
-- Paste into the Supabase SQL editor of the existing project (run once).
--
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
    shift_category              text default '',
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
    job_description               text default '',

    -- Compliances (PF/ESIC/PT/EPS/LWF)
    pf_registration               text default '',
    pf_applicable                  boolean not null default false,
    pf_no                          text default '',
    eps_applicable                 boolean not null default false,
    uan_no                         text default '',
    epf_join_date                  date,
    eps_join_date                  date,
    pf_gross_limit                 numeric(12,2) not null default 15000,
    eps_exit_date                  date,
    vpf_amount                     numeric(12,2) not null default 0,
    esic_registration              text default '',
    esic_applicable                 boolean not null default false,
    esic_no                         text default '',
    dispensary_name                 text default '',
    pt_registration                  text default '',
    pt_applicable                    boolean not null default false,
    lwf_registration                 text default '',
    lwf_applicable                   boolean not null default false,

    -- Other Details
    identification_mark              text default '',
    is_senior_citizen                boolean not null default false,
    is_super_senior_citizen          boolean not null default false,
    severe_disability                boolean not null default false,
    severe_disability_details        text default '',

    updated_at                       timestamptz not null default now()
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

alter table hr_employee_profile enable row level security;
alter table hr_employee_udf enable row level security;
