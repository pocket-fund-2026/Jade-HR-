-- Clause library for letters: reusable clauses HR can attach to a letter per
-- person (letter_type NULL = offered on every letter). Idempotent.
create table if not exists hr_letter_clauses (
    id          uuid primary key default gen_random_uuid(),
    letter_type text references hr_letter_templates(letter_type) on update cascade on delete cascade,
    title       text not null,
    body        text not null,
    default_on  boolean not null default false,
    sort_order  integer not null default 0,
    is_active   boolean not null default true,
    updated_by  uuid references hr_employees(id) on delete set null,
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);
create index if not exists idx_letter_clauses_type on hr_letter_clauses (letter_type) where is_active;
