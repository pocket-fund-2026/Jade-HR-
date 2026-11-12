-- HR-managed "Place of Work" options for the onboarding form (builder mode).
-- `value` is what gets stored on the submission / hr_employees.location (kept
-- short so policy logic keyed on location names keeps working); `address` is the
-- full address shown to the joiner. Idempotent.
create table if not exists hr_onboarding_locations (
    id         uuid primary key default gen_random_uuid(),
    value      text not null unique,
    address    text not null default '',
    is_hq      boolean not null default false,
    sort_order integer not null default 0,
    is_active  boolean not null default true,
    created_at timestamptz not null default now()
);
insert into hr_onboarding_locations (value, address, is_hq, sort_order) values
 ('Madhu Estate, Mumbai', 'Jade Lifestyles India, Madhu Estate, 2nd Floor B wing, Pandurang Budhkar Marg, Lower Parel, Mumbai 400013', true, 1),
 ('Pedder Road, Mumbai', '', false, 2),
 ('Mehrauli (Ambawatta), Delhi', '', false, 3),
 ('Emporio, Delhi', '', false, 4),
 ('Ahmedabad', '', false, 5)
on conflict (value) do nothing;

-- Onboarding reference numbers: 5-digit, continuing from 14851 (was 1001...).
do $$
begin
  update hr_onboarding_submissions s
     set reference_no = 14850 + r.rn
    from (select id, row_number() over (order by submitted_at, id) rn
            from hr_onboarding_submissions where reference_no < 10000) r
   where s.id = r.id;
  perform setval('hr_onboarding_ref_seq',
                 greatest(coalesce((select max(reference_no) from hr_onboarding_submissions), 0), 14850));
end $$;
