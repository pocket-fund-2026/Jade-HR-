-- Editable policy notices/amendments, one per policy tab (PolicyDocument.jsx's
-- POLICY_TABS keys: '2025' Corporate, '2026' Retail). The base policy
-- document text stays hardcoded JSX (it's tightly woven with live holiday
-- calendar / store timings data and per-employee-category section gating —
-- turning THAT into a freeform blob would risk silently breaking those), but
-- HR/Accounts need to publish amendments, clarifications or effective-date
-- changes without an engineer. This table backs that: a short rich-text
-- notice shown at the top of each tab, editable in the console by anyone
-- with employees.manage or policy.manage.
create table if not exists hr_policy_notices (
    key                 text primary key,
    title               text not null default '',
    body_html           text default '',
    updated_by          uuid references hr_employees(id),
    updated_at          timestamptz not null default now()
);

insert into hr_policy_notices (key, title, body_html) values
    ('2026', '', ''),
    ('2025', '', '')
on conflict (key) do nothing;

alter table hr_policy_notices enable row level security;
