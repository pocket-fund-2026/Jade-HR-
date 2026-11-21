-- Run on the SUPABASE STANDBY. Schema only (no data rows: they arrive by replication). Idempotent.
-- Covers migrations 079, 083, 086, 087 which were never mirrored.
begin;
alter table hr_exit_records add column if not exists system_password text not null default '';
alter table hr_onboarding_fields add column if not exists hr_only boolean not null default false;
create table if not exists hr_letter_clauses (
  id uuid primary key default gen_random_uuid(),
  letter_type text references hr_letter_templates(letter_type) on update cascade on delete cascade,
  title text not null, body text not null,
  default_on boolean not null default false, sort_order integer not null default 0,
  is_active boolean not null default true,
  updated_by uuid references hr_employees(id) on delete set null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists idx_letter_clauses_type on hr_letter_clauses (letter_type) where is_active;
alter table hr_letter_clauses add column if not exists conditions jsonb not null default '[]'::jsonb;
create table if not exists hr_exit_signers (
  id uuid primary key default gen_random_uuid(),
  row_department text not null,
  employee_id uuid not null references hr_employees(id) on delete cascade,
  scope_department text, created_at timestamptz not null default now(),
  unique (row_department, employee_id, scope_department));
create table if not exists hr_onboarding_core_fields (
  field_key text primary key, is_hidden boolean not null default false,
  hr_only boolean not null default false, label text, required boolean, sort_order integer,
  updated_by uuid references hr_employees(id) on delete set null,
  updated_at timestamptz not null default now());
insert into hr_ha.allowed_tables (name, pk) values
  ('hr_letter_clauses','{id}'),('hr_exit_signers','{id}'),('hr_onboarding_core_fields','{field_key}')
on conflict (name) do nothing;
do $$
declare t text; d record; stmt text;
begin
  if (select count(*) from pg_trigger where tgrelid='public.hr_workflow_events'::regclass and not tgisinternal)=0 then
    raise exception 'hr_workflow_events has no triggers to copy';
  end if;
  foreach t in array array['hr_letter_clauses','hr_exit_signers','hr_onboarding_core_fields'] loop
    for d in select tgname, pg_get_triggerdef(oid) as def from pg_trigger
             where tgrelid='public.hr_workflow_events'::regclass and not tgisinternal loop
      if exists (select 1 from pg_trigger where tgrelid=('public.'||t)::regclass and tgname=d.tgname) then continue; end if;
      stmt := regexp_replace(d.def,' ON (public\.)?hr_workflow_events ',' ON public.'||t||' ');
      if stmt=d.def then raise exception 'could not rewrite trigger %', d.tgname; end if;
      execute stmt;
    end loop;
  end loop;
end $$;
commit;
