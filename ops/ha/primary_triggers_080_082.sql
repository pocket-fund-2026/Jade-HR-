-- Run on the OFFICE-SERVER PRIMARY after sql/apply_080_082.sql.
-- Attaches the same replication capture triggers the existing tables have to the new tables.
do $$
declare t text; d record; stmt text;
begin
  -- Copy whatever triggers hr_workflow_events has (it is already wired for replication)
  -- onto the four new tables, so they behave exactly like the existing ones.
  if (select count(*) from pg_trigger where tgrelid = 'public.hr_workflow_events'::regclass and not tgisinternal) = 0 then
    raise exception 'hr_workflow_events has no triggers to copy; stop and tell Claude';
  end if;
  foreach t in array array['hr_onboarding_fields','hr_invoices','hr_invoice_events','hr_invoice_payments'] loop
    for d in select tgname, pg_get_triggerdef(oid) as def from pg_trigger
             where tgrelid = 'public.hr_workflow_events'::regclass and not tgisinternal loop
      if exists (select 1 from pg_trigger where tgrelid = ('public.' || t)::regclass and tgname = d.tgname) then continue; end if;
      stmt := regexp_replace(d.def, ' ON (public\.)?hr_workflow_events ', ' ON public.' || t || ' ');
      if stmt = d.def then raise exception 'could not rewrite trigger %', d.tgname; end if;
      execute stmt;
      raise notice 'added % on %', d.tgname, t;
    end loop;
  end loop;
end $$;
