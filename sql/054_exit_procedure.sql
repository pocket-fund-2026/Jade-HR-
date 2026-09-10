-- Exit procedure: a tracked departmental clearance checklist (from the
-- physical "Final Settlement Form") plus the Employee Exit Interview Form.
-- Piggybacks on the existing hr_employee_profile.employee_status /
-- scheduled_exit_date / exit_date fields (already read by clocks.py's
-- Notice-period clock and editable on the Employee page) rather than
-- duplicating them — these tables add the tracked WORKFLOW around those
-- fields, not a parallel copy of them.
-- Paste into the Supabase SQL editor of the existing project (run once).

create table if not exists hr_exit_records (
    id                     uuid primary key default gen_random_uuid(),
    employee_id            uuid not null references hr_employees(id) on delete cascade,

    resignation_date       date not null,
    last_working_day       date not null,

    -- Asset/access return — the header fields on the Final Settlement Form.
    system_no              text default '',
    monitor_returned       boolean not null default false,
    keyboard_returned      boolean not null default false,
    mouse_returned         boolean not null default false,
    system_password_reset  boolean not null default false,
    email_password_reset   boolean not null default false,

    status                 text not null default 'in_progress' check (status in ('in_progress', 'completed')),

    initiated_by           uuid references hr_employees(id),
    initiated_at           timestamptz not null default now(),
    completed_by           uuid references hr_employees(id),
    completed_at           timestamptz,

    created_at             timestamptz not null default now(),
    updated_at             timestamptz not null default now()
);

-- Only one open (in_progress) exit record per employee at a time — a rejoin
-- followed by a later re-exit is fine, since the earlier one is by then completed.
create unique index if not exists idx_hr_exit_records_one_open
    on hr_exit_records (employee_id) where status = 'in_progress';
create index if not exists idx_hr_exit_records_employee_id on hr_exit_records (employee_id);

-- The 9 department clearance rows from the Final Settlement Form, seeded
-- verbatim (see routers/exit_procedure.py's CHECKLIST_TEMPLATE) when an exit
-- record is created, so wording/order always matches the paper form.
create table if not exists hr_exit_checklist_items (
    id            uuid primary key default gen_random_uuid(),
    exit_id       uuid not null references hr_exit_records(id) on delete cascade,
    department    text not null,
    item_label    text not null,
    sort_order    int not null default 0,
    status        text not null default 'pending' check (status in ('pending', 'completed')),
    signed_by     text default '',
    signed_at     timestamptz,
    notes         text default '',
    updated_at    timestamptz not null default now()
);

create index if not exists idx_hr_exit_checklist_items_exit_id on hr_exit_checklist_items (exit_id);

-- Employee Exit Interview Form — one per exit record.
create table if not exists hr_exit_interviews (
    id                          uuid primary key default gen_random_uuid(),
    exit_id                     uuid not null references hr_exit_records(id) on delete cascade unique,

    reasons_for_leaving         text[] not null default '{}',
    reason_other                text default '',
    role_feedback               text default '',
    management_feedback         text default '',
    work_environment_feedback   text default '',
    retention_insight           text default '',
    would_rejoin                text default '',   -- Yes / No / Maybe
    would_recommend             text default '',   -- Yes / No / Maybe
    interviewee_signature       text default '',
    interviewer_signature       text default '',

    submitted_by                uuid references hr_employees(id),
    submitted_at                timestamptz,
    created_at                  timestamptz not null default now(),
    updated_at                  timestamptz not null default now()
);

alter table hr_exit_records enable row level security;
alter table hr_exit_checklist_items enable row level security;
alter table hr_exit_interviews enable row level security;

-- Same convention as every other hr_* table — no RLS policies; every access
-- goes through the backend's service-role client, which bypasses RLS.
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('exit.manage', 'Manage employee exit procedure (checklist & interview)', true)
on conflict (permission_key) do nothing;
