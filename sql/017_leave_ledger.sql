-- JADE HR — manual leave transaction ledger (Leave Entry page + Leave Ledger report).
--
-- This is deliberately separate from the existing on-the-fly PL accrual
-- formula in backend/routers/leave.py (_pl_accrued_to_date) — that formula
-- keeps driving leave-request approval/balance checks unchanged. This table
-- only holds the one-off manual entries (Credit/Debit/Adjustment) HR types
-- in directly, which the Leave Ledger report then merges alongside the
-- synthesized Auto Credit rows and approved leave requests.

create table if not exists hr_leave_ledger (
    id                uuid primary key default gen_random_uuid(),
    employee_id       uuid not null references hr_employees(id) on delete cascade,
    leave_type        text not null check (leave_type in
                          ('casual', 'sick', 'earned', 'unpaid', 'other', 'paternity', 'maternity', 'compassionate', 'comp_off')),
    transaction_type  text not null check (transaction_type in ('credit', 'debit', 'adjustment', 'auto_credit')),
    amount            numeric(5,2) not null,  -- signed: positive credits the balance, negative debits it
    remarks           text default '',
    entry_date        date not null,
    created_by        uuid references hr_employees(id),
    created_at        timestamptz not null default now()
);

create index if not exists idx_hr_leave_ledger_employee on hr_leave_ledger (employee_id, leave_type, entry_date);

alter table hr_leave_ledger enable row level security;
