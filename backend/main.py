from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS
from routers import (
    auth, biometric, disputes, employee_profile, employees, leave, payroll, permissions,
    salary_structure, selfie,
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
app.include_router(biometric.router)
app.include_router(disputes.router)
app.include_router(leave.router)
app.include_router(selfie.router)
app.include_router(permissions.router)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "jade-hr"}
