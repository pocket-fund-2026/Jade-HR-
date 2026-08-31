-- State column so the Store Timings display (console + employee policy page)
-- can group stores location-wise, then state-wise, per the retail policy
-- rollout doc. Additive/idempotent.
alter table hr_store_timings add column if not exists state text not null default '';

update hr_store_timings set state = 'Maharashtra' where store in ('Peddar Road', 'Ambawatta', 'Emporio');
update hr_store_timings set state = 'Gujarat' where store = 'Ahmedabad';
update hr_store_timings set state = 'Telangana' where store = 'Hyderabad';
