-- Attendance disputes can now be settled by the employee's reporting manager
-- OR by HR (2026-10-12). One dispute gets exactly ONE final decision: the
-- unique(dispute_id) below is the database-level guarantee that a manager and
-- HR can never both settle the same dispute, whoever acts first wins and the
-- other gets "already settled". hr_dispute_actions is the audit trail.
alter table hr_attendance_disputes add column if not exists resolved_by_role text;  -- manager | hr

create table if not exists hr_dispute_actions (
    id              uuid primary key default gen_random_uuid(),
    dispute_id      uuid not null unique references hr_attendance_disputes(id) on delete cascade,
    actor_id        uuid not null references hr_employees(id),
    actor_role      text not null check (actor_role in ('manager', 'hr')),
    action          text not null check (action in ('approve', 'reject')),
    note            text not null default '',
    first_in        time,
    last_out        time,
    status_override text,
    created_at      timestamptz not null default now()
);
create index if not exists idx_dispute_actions_actor on hr_dispute_actions (actor_id, created_at desc);
alter table hr_dispute_actions enable row level security;

-- Backfill: every dispute already settled so far was settled by HR/Accounts.
update hr_attendance_disputes set resolved_by_role = 'hr' where resolved_by is not null and resolved_by_role is null;
insert into hr_dispute_actions (dispute_id, actor_id, actor_role, action, note, created_at)
select id, resolved_by, 'hr', case status when 'approved' then 'approve' else 'reject' end, coalesce(admin_note, ''), coalesce(resolved_at, now())
from hr_attendance_disputes where resolved_by is not null and status in ('approved', 'rejected')
on conflict (dispute_id) do nothing;
