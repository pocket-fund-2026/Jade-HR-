-- JADE HR — per-employee Intern marker and OT-applicable toggle.

alter table hr_employees add column if not exists is_intern boolean not null default false;
alter table hr_employees add column if not exists ot_applicable boolean not null default true;
