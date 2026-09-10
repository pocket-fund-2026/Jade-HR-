-- Photo upload (required at onboarding) and resume upload (for offline/
-- consultant hires who came in outside the careers-page apply flow, so
-- there's no resume already on file from an application) — added to the
-- existing new-joinee onboarding form alongside Aadhaar/PAN/salary-slip.
-- Same 'onboarding-documents' private bucket, no new bucket needed.
-- Paste into the Supabase SQL editor of the existing project (run once).

alter table hr_onboarding_submissions add column if not exists photo_path text default '';
alter table hr_onboarding_submissions add column if not exists resume_path text default '';
