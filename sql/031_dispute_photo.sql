-- JADE HR — required photo attachment on attendance-dispute ("report a time
-- issue") reports, e.g. a photo of the physical attendance register as
-- supporting evidence. Same private-bucket-with-signed-URL pattern as
-- hr_absence_requests' attachment_path/attachment_filename (026).
-- Paste into the Supabase SQL editor of the existing project (run once).

alter table hr_attendance_disputes add column if not exists photo_path text;
alter table hr_attendance_disputes add column if not exists photo_filename text;

insert into storage.buckets (id, name, public)
values ('dispute-photos', 'dispute-photos', false)
on conflict (id) do nothing;
