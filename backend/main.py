from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import ALLOWED_ORIGINS
from routers import auth, biometric, employees, payroll

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
app.include_router(payroll.router)
app.include_router(biometric.router)


@app.get("/api/health")
def health():
    return {"ok": True, "service": "jade-hr"}
