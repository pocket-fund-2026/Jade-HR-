-- JADE HR — Arrears workflow for Accounts.
-- Extends hr_arrears (sql/051) with: the pay period it is paid in, a reason,
-- the period it relates to, tax withheld on it, and a pending/approved/
-- cancelled status with who/when. Only APPROVED rows reach net pay.
-- Existing rows are backfilled as approved, pay period derived from
-- effective_date (23rd-22nd cycle). Because payroll only adds arrears to net
-- pay from the Dec-2026 period onwards (arrears_calc.ARREAR_NET_PAY_FROM),
-- already-issued payslips do not change.
-- HA note: apply on the PRIMARY first, then mirror on the Supabase standby
-- (column additions need no allowlist change; hr_arrears is already replicated).

alter table hr_arrears add column if not exists pay_year   int;
alter table hr_arrears add column if not exists pay_month  int;
alter table hr_arrears add column if not exists reason     text not null default 'other';
alter table hr_arrears add column if not exists period_from date;
alter table hr_arrears add column if not exists period_to   date;
alter table hr_arrears add column if not exists tds_amount  numeric not null default 0;
alter table hr_arrears add column if not exists status      text not null default 'pending';
alter table hr_arrears add column if not exists approved_by uuid references hr_employees(id);
alter table hr_arrears add column if not exists approved_at timestamptz;
alter table hr_arrears add column if not exists cancelled_by uuid references hr_employees(id);
alter table hr_arrears add column if not exists cancelled_at timestamptz;
alter table hr_arrears add column if not exists cancel_reason text not null default '';

-- Backfill: pay period from effective_date; legacy rows count as approved.
update hr_arrears
set pay_year  = case when extract(day from effective_date) >= 23 and extract(month from effective_date) = 12
                     then extract(year from effective_date)::int + 1 else extract(year from effective_date)::int end,
    pay_month = case when extract(day from effective_date) >= 23
                     then (extract(month from effective_date)::int % 12) + 1 else extract(month from effective_date)::int end,
    status    = 'approved'
where pay_year is null;

alter table hr_arrears alter column pay_year set not null;
alter table hr_arrears alter column pay_month set not null;
alter table hr_arrears drop constraint if exists hr_arrears_status_chk;
alter table hr_arrears add constraint hr_arrears_status_chk check (status in ('pending','approved','cancelled'));
alter table hr_arrears drop constraint if exists hr_arrears_pay_month_chk;
alter table hr_arrears add constraint hr_arrears_pay_month_chk check (pay_month between 1 and 12);

create index if not exists idx_hr_arrears_pay_period on hr_arrears (pay_year, pay_month, status);
