-- Shared, append-only step log for console workflows (leave, comp-off, payslip
-- approvals, loans, onboarding, exit, AIP, Quarter Red Card). One row per
-- step: who did it, in what role, and the facts the decision rested on.
-- Written best-effort by backend/workflow_log.py; the app never updates or
-- deletes rows. Idempotent.
create table if not exists hr_workflow_events (
    id           bigserial primary key,
    workflow     text not null,
    subject_id   text,                         -- id of the request/record the step belongs to
    employee_id  uuid references hr_employees(id) on delete set null,
    action       text not null,
    actor_id     uuid references hr_employees(id) on delete set null,
    actor_role   text not null default 'system',
    basis        jsonb not null default '{}'::jsonb,
    note         text not null default '',
    created_at   timestamptz not null default now()
);
create index if not exists idx_workflow_events_recent on hr_workflow_events (created_at desc);
create index if not exists idx_workflow_events_subject on hr_workflow_events (workflow, subject_id);
create index if not exists idx_workflow_events_employee on hr_workflow_events (employee_id, created_at desc);
alter table hr_workflow_events enable row level security;

-- ---------------------------------------------------------------------------
-- Backfill: decisions taken before this log existed, rebuilt from each
-- workflow's own table so the log is not empty on day one. Stamped with the
-- original decision time, and marked basis.backfilled = true so they are never
-- mistaken for live-recorded steps. Idempotent: a step already in the log (live
-- or from an earlier run) is skipped. Only steps whose actor is on record are
-- rebuilt; nothing is invented. Dispute decisions come from hr_dispute_actions.
-- ---------------------------------------------------------------------------
insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, note, created_at)
select 'leave', r.id::text, r.employee_id, case r.status when 'approved' then 'approve' else 'reject' end,
       r.resolved_by, coalesce(a.role, 'system'),
       jsonb_build_object('leave_type', r.leave_type, 'start', r.start_date, 'end', r.end_date, 'backfilled', true),
       left(coalesce(r.admin_note, ''), 500), r.resolved_at
from hr_leave_requests r left join hr_employees a on a.id = r.resolved_by
where r.status in ('approved', 'rejected') and r.resolved_at is not null
  and not exists (select 1 from hr_workflow_events w where w.workflow = 'leave' and w.subject_id = r.id::text
                  and w.action in ('approve', 'reject'));

insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, note, created_at)
select 'loan', r.id::text, r.employee_id, case r.status when 'approved' then 'approve' else 'reject' end,
       r.resolved_by, coalesce(a.role, 'system'),
       jsonb_build_object('amount', r.amount, 'backfilled', true), left(coalesce(r.admin_note, ''), 500), r.resolved_at
from hr_loan_requests r left join hr_employees a on a.id = r.resolved_by
where r.status in ('approved', 'rejected') and r.resolved_at is not null
  and not exists (select 1 from hr_workflow_events w where w.workflow = 'loan' and w.subject_id = r.id::text
                  and w.action in ('approve', 'reject'));

insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, note, created_at)
select 'payslip_approval', r.id::text, r.employee_id, case r.status when 'approved' then 'approve' else 'reject' end,
       r.resolved_by, coalesce(a.role, 'system'),
       jsonb_build_object('period_year', r.period_year, 'period_month', r.period_month, 'backfilled', true),
       left(coalesce(r.admin_note, ''), 500), r.resolved_at
from hr_payslip_approvals r left join hr_employees a on a.id = r.resolved_by
where r.status in ('approved', 'rejected') and r.resolved_at is not null
  and not exists (select 1 from hr_workflow_events w where w.workflow = 'payslip_approval' and w.subject_id = r.id::text
                  and w.action in ('approve', 'reject'));

insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, note, created_at)
select 'onboarding', r.id::text, r.created_employee_id, case r.status when 'approved' then 'approve' else 'reject' end,
       r.resolved_by, coalesce(a.role, 'system'),
       jsonb_build_object('created_employee', r.created_employee_id is not null, 'backfilled', true),
       left(coalesce(r.admin_note, ''), 500), r.resolved_at
from hr_onboarding_submissions r left join hr_employees a on a.id = r.resolved_by
where r.status in ('approved', 'rejected') and r.resolved_at is not null
  and not exists (select 1 from hr_workflow_events w where w.workflow = 'onboarding' and w.subject_id = r.id::text
                  and w.action in ('approve', 'reject'));

insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, note, created_at)
select 'wfh', r.id::text, r.employee_id, case r.status when 'approved' then 'approve' else 'reject' end,
       r.resolved_by, coalesce(a.role, 'system'), jsonb_build_object('backfilled', true),
       left(coalesce(r.resolution_note, ''), 500), r.resolved_at
from hr_wfh_requests r left join hr_employees a on a.id = r.resolved_by
where r.status in ('approved', 'rejected') and r.resolved_at is not null
  and not exists (select 1 from hr_workflow_events w where w.workflow = 'wfh' and w.subject_id = r.id::text
                  and w.action in ('approve', 'reject'));

insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, note, created_at)
select 'absence', r.id::text, r.employee_id, case r.status when 'approved' then 'approve' else 'reject' end,
       r.resolved_by, coalesce(a.role, 'system'),
       jsonb_build_object('start', r.start_date, 'end', r.end_date, 'backfilled', true),
       left(coalesce(r.admin_note, ''), 500), r.resolved_at
from hr_absence_requests r left join hr_employees a on a.id = r.resolved_by
where r.status in ('approved', 'rejected') and r.resolved_at is not null
  and not exists (select 1 from hr_workflow_events w where w.workflow = 'absence' and w.subject_id = r.id::text
                  and w.action in ('approve', 'reject'));

insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, note, created_at)
select 'market_visit', r.id::text, r.employee_id, case r.status when 'approved' then 'approve' else 'reject' end,
       r.reviewed_by, coalesce(a.role, 'system'), jsonb_build_object('backfilled', true),
       left(coalesce(r.review_note, ''), 500), r.reviewed_at
from hr_market_visits r left join hr_employees a on a.id = r.reviewed_by
where r.status in ('approved', 'rejected') and r.reviewed_at is not null
  and not exists (select 1 from hr_workflow_events w where w.workflow = 'market_visit' and w.subject_id = r.id::text
                  and w.action in ('approve', 'reject'));

-- Disputes: hr_dispute_actions already holds who settled each one and in which role.
insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, note, created_at)
select 'dispute', x.dispute_id::text, d.employee_id, x.action, x.actor_id, x.actor_role,
       jsonb_build_object('date', d.date, 'issue_type', d.issue_type, 'status_override', x.status_override, 'backfilled', true),
       left(coalesce(x.note, ''), 500), x.created_at
from hr_dispute_actions x join hr_attendance_disputes d on d.id = x.dispute_id
where not exists (select 1 from hr_workflow_events w where w.workflow = 'dispute' and w.subject_id = x.dispute_id::text
                  and w.action in ('approve', 'reject'));

-- AIP: start and close.
insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, created_at)
select 'aip', r.id::text, r.employee_id, 'started', r.created_by, coalesce(a.role, 'system'),
       jsonb_build_object('start_date', r.start_date, 'backfilled', true), r.created_at
from hr_aip_records r left join hr_employees a on a.id = r.created_by
where not exists (select 1 from hr_workflow_events w where w.workflow = 'aip' and w.subject_id = r.id::text and w.action = 'started');

insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, created_at)
select 'aip', r.id::text, r.employee_id, 'closed_' || r.status, r.closed_by, coalesce(a.role, 'system'),
       jsonb_build_object('backfilled', true), r.closed_at
from hr_aip_records r left join hr_employees a on a.id = r.closed_by
where r.status in ('passed', 'failed') and r.closed_at is not null
  and not exists (select 1 from hr_workflow_events w where w.workflow = 'aip' and w.subject_id = r.id::text
                  and w.action in ('closed_passed', 'closed_failed'));

-- Quarter Red Card applications.
insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, created_at)
select 'quarter_red_card', r.id::text, r.employee_id, 'applied', r.created_by, coalesce(a.role, 'system'),
       jsonb_build_object('financial_year', r.financial_year, 'quarter', r.quarter, 'pl_forfeited', r.pl_forfeited,
                          'late_marks', r.late_marks, 'letter_issued', r.letter_id is not null, 'backfilled', true),
       r.created_at
from hr_late_policy_actions r left join hr_employees a on a.id = r.created_by
where not exists (select 1 from hr_workflow_events w where w.workflow = 'quarter_red_card' and w.subject_id = r.id::text);

-- Hand-granted Comp-Offs (automatic accruals have no granted_by and are skipped).
insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, created_at)
select 'comp_off', r.id::text, r.employee_id, 'granted_by_hand', r.granted_by, coalesce(a.role, 'system'),
       jsonb_build_object('earned_date', r.earned_date, 'units', r.units, 'backfilled', true), r.created_at
from hr_comp_off_ledger r left join hr_employees a on a.id = r.granted_by
where r.granted_by is not null
  and not exists (select 1 from hr_workflow_events w where w.workflow = 'comp_off' and w.subject_id = r.id::text);

-- Exit: finalized records and completed checklist steps (signer is free text, so no actor id).
insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_id, actor_role, basis, created_at)
select 'exit', r.id::text, r.employee_id, 'finalized', r.completed_by, coalesce(a.role, 'system'),
       jsonb_build_object('backfilled', true), r.completed_at
from hr_exit_records r left join hr_employees a on a.id = r.completed_by
where r.status = 'completed' and r.completed_at is not null
  and not exists (select 1 from hr_workflow_events w where w.workflow = 'exit' and w.subject_id = r.id::text and w.action = 'finalized');

insert into hr_workflow_events (workflow, subject_id, employee_id, action, actor_role, basis, created_at)
select 'exit', i.exit_id::text, e.employee_id, 'step_completed', 'system',
       jsonb_build_object('item_id', i.id, 'signed_by', i.signed_by, 'backfilled', true), i.signed_at
from hr_exit_checklist_items i join hr_exit_records e on e.id = i.exit_id
where i.status = 'completed' and i.signed_at is not null
  and not exists (select 1 from hr_workflow_events w where w.workflow = 'exit' and w.subject_id = i.exit_id::text
                  and w.action = 'step_completed' and w.basis->>'item_id' = i.id::text);
