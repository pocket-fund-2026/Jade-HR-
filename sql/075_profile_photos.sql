-- Profile photos (2026-10-12): one small private image per person, served via
-- short-lived signed URLs from GET /api/auth/me.
alter table hr_employees add column if not exists avatar_path text;
insert into storage.buckets (id, name, public) values ('profile-photos', 'profile-photos', false) on conflict (id) do nothing;
