-- JADE HR — admin-manageable shift time slots and per-store default timings,
-- so Nimit/HR can set/add store timings from the console instead of a
-- hardcoded list requiring a code deploy.
--
-- hr_time_slots: the option list shown on Employee Details' Time Slot select
-- and consulted by payroll.py (via register_time_slot(), called on backend
-- startup and after every admin edit) for late-grace grading. Seeded with
-- the 4 slots already hardcoded in payroll.SHIFT_START_BY_TIME_SLOT so
-- nothing changes behaviour on deploy.
create table if not exists hr_time_slots (
    id            uuid primary key default gen_random_uuid(),
    label         text not null unique,
    shift_start   time not null,
    sort_order    int not null default 0,
    created_at    timestamptz not null default now()
);

insert into hr_time_slots (label, shift_start, sort_order) values
    ('10:00 AM – 6:30 PM', '10:00', 1),
    ('10:00 AM – 7:00 PM', '10:00', 2),
    ('11:00 AM – 8:00 PM', '11:00', 3),
    ('Intern (10:00 AM – 6:00 PM)', '10:00', 4)
on conflict (label) do nothing;

-- hr_store_timings: per-store opening/trading/closing hours shown on the
-- employee-facing policy page (was the hardcoded SHIFT_TIMINGS array in
-- PolicyDocument.jsx) and the default time slot new employees at that store
-- should be set to. `store` matches hr_employee_profile.unit for retail
-- stores (Peddar Road, Emporio, Ambawatta, Ahmedabad, Hyderabad).
create table if not exists hr_store_timings (
    id                     uuid primary key default gen_random_uuid(),
    store                  text not null unique,
    opening                text not null default '',
    trading                text not null default '',
    closing                text not null default '',
    default_time_slot      text references hr_time_slots(label) on update cascade on delete set null,
    sort_order             int not null default 0,
    created_at             timestamptz not null default now()
);

insert into hr_store_timings (store, opening, trading, closing, default_time_slot, sort_order) values
    ('Peddar Road', '9:00 am',  '10:30 am – 8:00 pm', '8:30 pm', '10:00 AM – 6:30 PM', 1),
    ('Emporio',     '10:30 am', '11:00 am – 7:30 pm', '8:00 pm', '11:00 AM – 8:00 PM', 2),
    ('Ambawatta',   '9:00 am',  '10:30 am – 8:00 pm', '8:30 pm', '10:00 AM – 6:30 PM', 3),
    ('Ahmedabad',   '9:00 am',  '10:30 am – 8:00 pm', '8:30 pm', '10:00 AM – 6:30 PM', 4),
    ('Hyderabad',   '9:00 am',  '10:30 am – 8:00 pm', '8:30 pm', '10:00 AM – 6:30 PM', 5)
on conflict (store) do nothing;
