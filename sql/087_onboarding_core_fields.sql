-- Form builder: HR can hide, rename or change "required" on the built-in questions
-- of the new-joinee form. Only changed fields have a row; no row = default behaviour.
-- Apply to the PRIMARY first, then mirror to Supabase (allowlist + cloud_guard trigger).
create table if not exists hr_onboarding_core_fields (
    field_key   text primary key,
    is_hidden   boolean not null default false,
    hr_only     boolean not null default false,   -- not asked of the candidate; HR fills it in on the submission
    label       text,                 -- null = built-in label
    required    boolean,              -- null = built-in default
    sort_order  integer,              -- drag-and-drop position within its section; null = built-in order
    updated_by  uuid references hr_employees(id) on delete set null,
    updated_at  timestamptz not null default now()
);

-- Same flag for the extra questions HR adds.
alter table hr_onboarding_fields add column if not exists hr_only boolean not null default false;
