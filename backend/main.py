from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS
from routers import (
    auth, biometric, disputes, employee_profile, employees, holidays, leave, leave_ledger, letters, onboarding,
    payroll, payslip_approvals, permissions, reports, salary_structure, selfie, tax_declaration,
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
app.include_router(tax_declaration.router)
app.include_router(letters.router)
app.include_router(leave_ledger.router)
app.include_router(payslip_approvals.router)
app.include_router(onboarding.router)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "jade-hr"}
