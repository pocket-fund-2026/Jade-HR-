-- JADE HR — New-joinee onboarding form: an unauthenticated public form
-- (replaces the external Zoho "Details" form) collects personal/address/
-- bank/document/employment/compensation/authorization details, landing here
-- as a pending submission for HR review before becoming a real employee
-- record — mirrors hr_payslip_approvals' submit -> pending -> approve/reject
-- shape. Approving inserts the corresponding hr_employees/hr_employee_profile
-- rows (see routers/onboarding.py); the submission itself stays as the
-- permanent joining-formalities record, including the uploaded ID documents,
-- since several of its fields (KRA, offer-letter date, authorized signatory/
-- approver, "requires personal email"/"requires OMS login" IT action items)
-- have no home on the employee record itself.
-- Paste into the Supabase SQL editor of the existing project (run once).
create table if not exists hr_onboarding_submissions (
    id                       uuid primary key default gen_random_uuid(),
    status                   text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    submitted_at             timestamptz not null default now(),
    admin_note               text default '',
    resolved_by              uuid references hr_employees(id),
    resolved_at              timestamptz,
    created_employee_id      uuid references hr_employees(id),

    -- Personal
    full_name                text not null default '',
    date_of_birth            date,
    mobile                   text default '',
    emergency_contact_no     text default '',
    email                    text default '',

    -- Permanent address, collected as 4 lines matching the source form
    -- (flat/house, road/street, landmark/area, city-pin-country).
    address_line1            text default '',
    address_line2            text default '',
    address_line3            text default '',
    address_line4            text default '',

    -- Employment
    date_of_joining          date,
    is_fresher               boolean not null default false,
    designation              text default '',
    department               text default '',
    kra                      text default '',
    requires_personal_email  boolean not null default false,
    requires_oms_login       boolean not null default false,
    place_of_work            text default '',
    timings_and_days         text default '',

    -- Bank
    bank_name                text default '',
    bank_account_no          text default '',
    bank_ifsc                text default '',

    -- Documents — text columns are the reference numbers; *_path columns are
    -- private-bucket storage paths (see the 'onboarding-documents' bucket
    -- below), signed on demand for HR review, never made public.
    aadhar_no                text default '',
    aadhar_front_path        text default '',
    aadhar_back_path         text default '',
    pan_no                   text default '',
    pan_card_path            text default '',
    salary_slip_paths        jsonb not null default '[]'::jsonb,
    date_of_offer_letter     date,

    -- Compensation
    basic                    numeric(12,2) not null default 0,
    hra                      numeric(12,2) not null default 0,
    conveyance               numeric(12,2) not null default 0,
    other_allowance          numeric(12,2) not null default 0,
    monthly_ctc              numeric(12,2) not null default 0,

    -- Authorization — signatory/approver sign-off from the source form;
    -- signature_confirmed is a typed affirmation, not a drawn e-signature.
    signatory_name           text default '',
    signatory_designation    text default '',
    signatory_email          text default '',
    approver_name            text default '',
    approver_email           text default '',
    signature_confirmed      boolean not null default false
);

create index if not exists idx_hr_onboarding_submissions_status on hr_onboarding_submissions (status);
create index if not exists idx_hr_onboarding_submissions_submitted_at on hr_onboarding_submissions (submitted_at);

alter table hr_onboarding_submissions enable row level security;

-- Same convention as every other hr_* table — no RLS policies; every access
-- (including the public submit/upload endpoints) goes through the backend's
-- service-role client, which bypasses RLS. The public endpoints are exactly
-- as trusted as the rest of the backend, by design (see auth.require_permission
-- for the admin-side review-queue endpoints).
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('onboarding.manage', 'Review new-joinee onboarding submissions and approve/reject them', false)
on conflict (permission_key) do nothing;

-- Private bucket for Aadhar/PAN/salary-slip images uploaded from the public
-- onboarding form — same pattern as the existing 'selfies' bucket.
insert into storage.buckets (id, name, public)
values ('onboarding-documents', 'onboarding-documents', false)
on conflict (id) do nothing;
