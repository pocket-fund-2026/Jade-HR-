-- hr_store_timings.store was seeded (038) as "Peddar Road" -- a typo. Every
-- other reference to this store in the codebase (backend/config.py,
-- statutory.py, hr_employees.location itself, e.g. "Pedder Road, Mumbai")
-- spells it "Pedder Road". Fixing the spelling here also makes the
-- employee-facing store-timings substring match (employee location contains
-- the store name) actually work for this store.
update hr_store_timings set store = 'Pedder Road' where store = 'Peddar Road';
