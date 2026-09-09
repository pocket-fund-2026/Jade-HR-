-- HR Tasks: add a priority tier so the team can see what's urgent at a
-- glance, not just what's overdue. 'normal' default keeps every existing
-- row valid without a backfill.
alter table hr_tasks add column if not exists priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent'));

create index if not exists idx_hr_tasks_priority on hr_tasks (priority);
