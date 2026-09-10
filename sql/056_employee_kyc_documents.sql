-- Central storage for existing employees' Aadhaar/PAN scans — previously
-- these lived on HR's local PC (a flagged compliance risk), not in the
-- system. Same private-bucket-with-signed-URL pattern as onboarding-
-- documents; access follows the same salary.view gate the aadhar_no/pan_no
-- text fields already use (see SENSITIVE_PROFILE_FIELDS in
-- routers/employee_profile.py) — HR/Accounts (or the employee themselves)
-- only.
-- Paste into the Supabase SQL editor of the existing project (run once).

alter table hr_employee_profile add column if not exists aadhar_card_path text;
alter table hr_employee_profile add column if not exists pan_card_path text;

insert into storage.buckets (id, name, public)
values ('employee-documents', 'employee-documents', false)
on conflict (id) do nothing;
