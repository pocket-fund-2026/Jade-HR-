-- JADE HR — Work-related absence request form. Deliberately separate from
-- hr_leave_requests (casual/sick/earned/unpaid): no leave type, no leave-
-- balance interaction, and the employee names their own approver by free-
-- text name+email rather than picking from an existing jade-hr login (the
-- approver may not have one). The approver gets an email notification, but
-- approve/reject happens in-app via the absence.manage permission — mirrors
-- hr_leave_requests / hr_onboarding_submissions' submit -> pending ->
-- approve/reject shape.
-- Paste into the Supabase SQL editor of the existing project (run once).

-- Reuses the existing "reporting manager" concept (hr_employee_profile.
-- reporting_to is already free-text) rather than inventing a parallel field;
-- this just adds the email half so both can be pre-filled next time.
alter table hr_employee_profile add column if not exists reporting_to_email text default '';

create table if not exists hr_absence_requests (
    id                   uuid primary key default gen_random_uuid(),
    employee_id          uuid not null references hr_employees(id) on delete cascade,

    -- Snapshot of employee details at submission time, matching the source
    -- form's own fields (rather than only joining hr_employees live).
    department           text default '',
    employee_code        text default '',
    first_name           text default '',
    last_name            text default '',
    email                text default '',

    start_date           date not null,
    end_date             date not null,
    number_of_days       numeric(4,1) not null default 0,
    details              text not null default '',

    approver_name        text not null default '',
    approver_email       text not null default '',

    -- Optional supporting document — same private-bucket-with-signed-URL
    -- pattern as hr_onboarding_submissions' document fields.
    attachment_path      text,
    attachment_filename  text,

    status               text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
    admin_note           text default '',
    resolved_by          uuid references hr_employees(id),
    resolved_at          timestamptz,

    created_at           timestamptz not null default now(),
    updated_at           timestamptz not null default now()
);

create index if not exists idx_hr_absence_requests_employee_id on hr_absence_requests (employee_id);
create index if not exists idx_hr_absence_requests_status on hr_absence_requests (status);

alter table hr_absence_requests enable row level security;

-- Same convention as every other hr_* table — no RLS policies; every access
-- goes through the backend's service-role client, which bypasses RLS.
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('absence.manage', 'Review work-related absence requests and approve/reject them', true)
on conflict (permission_key) do nothing;

-- Private bucket for the optional supporting attachment — same pattern as
-- 'onboarding-documents' and 'selfies'.
insert into storage.buckets (id, name, public)
values ('absence-attachments', 'absence-attachments', false)
on conflict (id) do nothing;
