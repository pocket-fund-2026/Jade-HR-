-- JADE HR — Salary Structure (CTC breakdown, versioned by effective date)
-- Paste into the Supabase SQL editor of the existing project (run once).
--
-- Mirrors the "Salary Structure" entry screen: Manual Entry (Prorata) is
-- what the officer types in; Earning/Deductions/Others (Calculated) are the
-- full line-item breakdown for this effective period. Total
-- Earnings/Deductions/Net Salary/CTC Monthly/CTC Yearly are computed
-- server-side at save time (see backend/routers/salary_structure.py) and
-- stored as a snapshot — so a later formula change never silently rewrites
-- a past payroll-relevant figure.

create table if not exists hr_salary_structure (
    id                              uuid primary key default gen_random_uuid(),
    employee_id                     uuid not null references hr_employees(id) on delete cascade,
    effective_date                  date not null,

    -- Manual Entry (Prorata)
    me_basic                        numeric(12,2) not null default 0,
    me_hra                          numeric(12,2) not null default 0,
    me_conv                         numeric(12,2) not null default 0,
    me_other_allow                  numeric(12,2) not null default 0,
    me_monthly_bonus                numeric(12,2) not null default 0,
    me_retention                    numeric(12,2) not null default 0,
    me_incentive                    numeric(12,2) not null default 0,

    -- Earning (Calculated)
    earn_basic                      numeric(12,2) not null default 0,
    earn_hra                        numeric(12,2) not null default 0,
    earn_conv                       numeric(12,2) not null default 0,
    earn_other_allow                numeric(12,2) not null default 0,
    earn_ot_amt                     numeric(12,2) not null default 0,
    earn_arrear                     numeric(12,2) not null default 0,
    earn_bonus                      numeric(12,2) not null default 0,
    earn_leave_encash               numeric(12,2) not null default 0,
    earn_monthly_bonus              numeric(12,2) not null default 0,
    earn_performance_linked_pay     numeric(12,2) not null default 0,
    earn_retention                  numeric(12,2) not null default 0,
    earn_incentive                  numeric(12,2) not null default 0,
    earn_ctc                        numeric(12,2) not null default 0,
    earn_total_arr                  numeric(12,2) not null default 0,

    -- Deductions (Calculated)
    ded_pf                          numeric(12,2) not null default 0,
    ded_pt                          numeric(12,2) not null default 0,
    ded_vpf                         numeric(12,2) not null default 0,
    ded_esic                        numeric(12,2) not null default 0,
    ded_tds                         numeric(12,2) not null default 0,
    ded_loan                        numeric(12,2) not null default 0,
    ded_advance                     numeric(12,2) not null default 0,
    ded_loan_int                    numeric(12,2) not null default 0,
    ded_lwf                         numeric(12,2) not null default 0,
    ded_other_ded                   numeric(12,2) not null default 0,
    ded_salary_advance               numeric(12,2) not null default 0,
    ded_pf_arrear                    numeric(12,2) not null default 0,

    -- Others (Calculated) — employer-side statutory wages/contributions
    oth_pt_wages                     numeric(12,2) not null default 0,
    oth_lwf_wages                    numeric(12,2) not null default 0,
    oth_eps_wages                    numeric(12,2) not null default 0,
    oth_eps                          numeric(12,2) not null default 0,
    oth_epf                          numeric(12,2) not null default 0,
    oth_edli_charges                 numeric(12,2) not null default 0,
    oth_pf_admin_charges             numeric(12,2) not null default 0,
    oth_edli_admin_charges           numeric(12,2) not null default 0,
    oth_esic_wages                   numeric(12,2) not null default 0,
    oth_esic_employer                numeric(12,2) not null default 0,
    oth_pf_wages                     numeric(12,2) not null default 0,
    oth_edli_wages                   numeric(12,2) not null default 0,

    -- Computed snapshot (see backend for formulas)
    total_earnings                   numeric(12,2) not null default 0,
    total_deductions                 numeric(12,2) not null default 0,
    ctc_monthly                      numeric(12,2) not null default 0,
    net_salary                       numeric(12,2) not null default 0,
    ctc_yearly                       numeric(12,2) not null default 0,

    salary_remarks                   text default '',

    created_by                       uuid references hr_employees(id),
    created_at                       timestamptz not null default now(),
    updated_at                       timestamptz not null default now(),

    unique (employee_id, effective_date)
);

create index if not exists idx_hr_salary_structure_employee
    on hr_salary_structure (employee_id, effective_date desc);

alter table hr_salary_structure enable row level security;
