from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS
from routers import (
    absence, arrears, auth, biometric, careers, clocks, comp_off, confirmations, disputes, employee_profile,
    employees,
    exit_procedure,
    holidays, hr_tasks, late_policy, leave, leave_ledger, letters, loans, market_visits, onboarding, payroll,
    payslip_approvals, permissions, personal_info, policy_ack, reports, salary_paid, salary_structure, selfie,
    store_timings, tax_declaration, wfh,
)

app = FastAPI(title="JADE HR")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(employees.router)
app.include_router(employee_profile.router)
app.include_router(salary_structure.router)
app.include_router(payroll.router)
app.include_router(reports.router)
app.include_router(biometric.router)
app.include_router(disputes.router)
app.include_router(leave.router)
app.include_router(selfie.router)
app.include_router(permissions.router)
app.include_router(holidays.router)
app.include_router(holidays.me_router)
app.include_router(tax_declaration.router)
app.include_router(letters.router)
app.include_router(leave_ledger.router)
app.include_router(payslip_approvals.router)
app.include_router(onboarding.router)
app.include_router(absence.router)
app.include_router(late_policy.router)
app.include_router(policy_ack.router)
app.include_router(personal_info.router)
app.include_router(wfh.router)
app.include_router(store_timings.router)
app.include_router(market_visits.router)
app.include_router(arrears.router)
app.include_router(salary_paid.router)
app.include_router(hr_tasks.router)
app.include_router(careers.router)
app.include_router(clocks.router)
app.include_router(comp_off.router)
app.include_router(comp_off.me_router)
app.include_router(confirmations.router)
app.include_router(exit_procedure.router)
app.include_router(exit_procedure.me_router)
app.include_router(loans.router)

# Loads admin-defined shift time slots (hr_time_slots) into payroll.py's
# in-memory SHIFT_START_BY_TIME_SLOT so lateness grading picks them up from
# the first request — the 4 slots hardcoded there as defaults keep working
# even if this fails (e.g. DB unreachable at boot).
store_timings.load_time_slots_into_payroll()


@app.get("/api/health")
def health():
    return {"ok": True, "service": "jade-hr"}
