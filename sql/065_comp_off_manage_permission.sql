-- Dedicated Comp-Off visibility/approval permission (HR meeting 25 Sept
-- 2026): "Need to build a new section so HR can also see and approve comp
-- offs" — the Comp-Off console page was gated on employees.manage/
-- policy.manage, two broad admin permissions only Rishikesh and Nimit hold,
-- which is why the rest of HR couldn't see it. hr_can_access=true grants the
-- whole HR team view+grant access by default; still toggleable per person
-- via Team Access like every other permission.
insert into hr_permissions (permission_key, label, hr_can_access) values
    ('comp_off.manage', 'View and approve Comp-Off (grant, mark attendance dates)', true)
on conflict (permission_key) do nothing;
