-- Run on the OFFICE-SERVER PRIMARY (omsserver). Idempotent. Creates the Attendance Remarks table,
-- gives it the same replication triggers as the existing tables, and makes the API see it at once.
begin;
create table if not exists hr_attendance_remarks (
    id           uuid primary key default gen_random_uuid(),
    employee_id  uuid not null references hr_employees(id) on delete cascade,
    date         date not null,
    remark       text not null,
    updated_by   uuid references hr_employees(id),
    updated_at   timestamptz not null default now(),
    unique (employee_id, date)
);
create index if not exists idx_attendance_remarks_date on hr_attendance_remarks (date);
alter table hr_attendance_remarks enable row level security;

do $$
declare d record; stmt text;
begin
  if (select count(*) from pg_trigger where tgrelid = 'public.hr_workflow_events'::regclass and not tgisinternal) = 0 then
    raise exception 'hr_workflow_events has no triggers to copy; stop and tell Claude';
  end if;
  for d in select tgname, pg_get_triggerdef(oid) as def from pg_trigger
           where tgrelid = 'public.hr_workflow_events'::regclass and not tgisinternal loop
    if exists (select 1 from pg_trigger where tgrelid = 'public.hr_attendance_remarks'::regclass and tgname = d.tgname) then continue; end if;
    stmt := regexp_replace(d.def, ' ON (public\.)?hr_workflow_events ', ' ON public.hr_attendance_remarks ');
    if stmt = d.def then raise exception 'could not rewrite trigger %', d.tgname; end if;
    execute stmt;
  end loop;
end $$;
commit;
notify pgrst, 'reload schema';
