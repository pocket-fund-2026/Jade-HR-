-- JADE HR — Late-arrival policy revision, w.e.f. 22 September 2026.
--
-- Policy: on time until 10:20 am; the first 3 late arrivals in a month are a
-- Yellow Card with no deduction; from the 4th, 0.25 day (or 0.5 day from
-- 11:00 am onwards); more than 3 late marks in a month is a Red Card; and a
-- Red Card in every month of a financial-year quarter is a "Quarter Red Card"
-- — Final Warning letter plus forfeiture of 2 Paid Leave days.
--
-- The grading itself is pure Python (backend/payroll.py). This migration adds
-- only what the Quarter Red Card consequence needs to be recorded.

-- 1. hr_leave_ledger could never actually hold a Paid Leave entry: its CHECK
--    still listed only the pre-unification types, while the code has written
--    and read leave_type='paid' since the 24-day PL pool landed (sql/029 fixed
--    this for hr_leave_requests but not for the ledger). The Quarter Red Card
--    forfeiture posts a 'paid' debit, so widen it to match sql/029. The table
--    is empty, so nothing needs backfilling.
alter table hr_leave_ledger drop constraint if exists hr_leave_ledger_leave_type_check;
alter table hr_leave_ledger add constraint hr_leave_ledger_leave_type_check
    check (leave_type in ('paid', 'casual', 'sick', 'earned', 'unpaid', 'other',
                          'paternity', 'maternity', 'compassionate', 'comp_off'));

-- 2. One row per employee per FY quarter they earned a Quarter Red Card in.
--    The UNIQUE key is what makes the automatic PL forfeiture idempotent — the
--    quarterly run can be re-invoked (or run twice by cron) without ever
--    double-debiting someone's leave balance.
create table if not exists hr_late_policy_actions (
    id              uuid primary key default gen_random_uuid(),
    employee_id     uuid not null references hr_employees(id) on delete cascade,
    financial_year  text not null,                       -- e.g. '2026-27'
    quarter         int  not null check (quarter between 1 and 4),
    -- Late-mark count per pay period in the quarter, e.g. {"2026-07": 4, ...},
    -- kept so the letter and any later dispute can be reconstructed from the
    -- numbers that were true when the action fired.
    late_marks      jsonb not null default '{}',
    pl_forfeited    numeric(5,2) not null default 2,
    ledger_entry_id uuid references hr_leave_ledger(id) on delete set null,
    letter_id       uuid references hr_generated_letters(id) on delete set null,
    created_by      uuid references hr_employees(id),
    created_at      timestamptz not null default now(),
    unique (employee_id, financial_year, quarter)
);

create index if not exists idx_hr_late_policy_actions_quarter
    on hr_late_policy_actions (financial_year, quarter);

alter table hr_late_policy_actions enable row level security;

-- 3. The Final Warning letter the Quarter Red Card issues. Same {{token}}
--    template mechanism as every other letter (backend/routers/letters.py).
insert into hr_letter_templates (letter_type, title, body) values

('final_warning', 'Final Warning Letter — Late Arrival', $body$
<p>To,</p>
<p><strong>{{employee_name}}</strong><br>
{{designation}}, {{department}}</p>
<p>Employee Code: {{employee_code}}</p>
<p><strong>Re: Final Warning — Persistent Late Arrival ({{quarter_label}})</strong></p>
<p>Dear <strong>{{employee_name}}</strong>,</p>
<p>As per the Company's late-arrival policy effective 22 September 2026, reporting for work beyond 10:20 am is recorded as a late marking. The first three late markings in a month are issued as a Yellow Card, and being late on more than three occasions in a month results in a Red Card for that month.</p>
<p>Our attendance records show that you have received a Red Card in each month of {{quarter_label}}:</p>
<p>{{late_mark_summary}}</p>
<p>This constitutes a <strong>Quarter Red Card</strong>. Accordingly, this letter serves as a <strong>Final Warning</strong>, and {{pl_forfeited}} days of your Paid Leave entitlement stand forfeited with effect from {{action_date}}.</p>
<p>You are advised to report for work within your prescribed shift timing without exception. Any further recurrence will invite disciplinary action, which may include termination of your employment.</p>
<p>If you believe any of the attendance records above are incorrect, please raise an attendance dispute through the HR Console within seven days of this letter.</p>
<p>Yours Faithfully,</p>
<p><strong>{{signatory_name}} – {{signatory_title}}</strong><br>
<strong>{{company_name}}</strong> &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; Mumbai, {{letter_date}}</p>
$body$)

on conflict (letter_type) do nothing;
