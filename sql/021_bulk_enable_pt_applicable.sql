-- JADE HR — one-time bulk-enable of "PT Applicable" for every active
-- employee located in a Professional-Tax-liable state.
-- Paste into the Supabase SQL editor (run once).
--
-- pt_applicable defaults to false for everyone (003_employee_profile.sql)
-- and nobody had ever ticked it on — which is why the PT Sheet & Challan
-- report (gated on this flag, see backend/payroll.py) showed zero
-- employees despite PT genuinely being owed. Location matching mirrors
-- statutory.py's location_to_state() fuzzy match exactly (mumbai/
-- ahmedabad/kolkata substrings -> maharashtra/gujarat/west_bengal). Delhi
-- has no Professional Tax law and is intentionally left untouched.
--
-- Idempotent — safe to re-run; only flips rows that aren't already true.

update hr_employee_profile
set pt_applicable = true
where employee_id in (
    select id from hr_employees
    where is_active = true
      and (
          lower(location) like '%mumbai%'
          or lower(location) like '%ahmedabad%'
          or lower(location) like '%kolkata%'
      )
)
and pt_applicable is distinct from true;
