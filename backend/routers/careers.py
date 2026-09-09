"""Proxy for jade-careers' own admin API (a separate Express+SQLite app at
/root/jade-careers), so Jobs + Applicants live inside the JADE HR admin
console instead of behind jade-careers' own separate admin login — restricted
here to accounts/hr (Admin Console + HR team), same as every other gated
section, via require_permission("careers.manage").

No local copy of jobs/applications data is kept — every request is forwarded
live to jade-careers' API and its response passed straight back. Auth to
that API rides a short-lived JWT minted with the same secret jade-careers'
own server verifies (CAREERS_JWT_SECRET, mirrors /etc/jade-careers.env's
JWT_SECRET) rather than jade-careers' own admin email/password, so no
separate login step or shared credential is exposed to the browser.
"""

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Query
from jose import jwt

from auth import require_permission
from config import CAREERS_API_BASE, CAREERS_JWT_SECRET

router = APIRouter(prefix="/api/careers", tags=["careers"])

_gate = Depends(require_permission("careers.manage"))


def _careers_token() -> str:
    return jwt.encode({"id": 1, "email": "careers@jadecouture.com"}, CAREERS_JWT_SECRET, algorithm="HS256")


def _proxy(method: str, path: str, **kwargs) -> dict | list:
    try:
        resp = httpx.request(
            method,
            f"{CAREERS_API_BASE}{path}",
            headers={"Authorization": f"Bearer {_careers_token()}"},
            timeout=15,
            **kwargs,
        )
    except httpx.RequestError as exc:
        raise HTTPException(status_code=502, detail=f"Careers service unreachable: {exc}")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code, detail=resp.text)
    return resp.json()


# ---------- Jobs ----------
@router.get("/jobs")
def list_jobs(user: dict = _gate):
    return _proxy("GET", "/api/admin/jobs")


@router.post("/jobs")
def create_job(body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", "/api/admin/jobs", json=body)


@router.put("/jobs/{job_id}")
def update_job(job_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("PUT", f"/api/admin/jobs/{job_id}", json=body)


@router.delete("/jobs/{job_id}")
def delete_job(job_id: int, user: dict = _gate):
    return _proxy("DELETE", f"/api/admin/jobs/{job_id}")


# ---------- Applicants ----------
@router.get("/applications")
def list_applications(job_id: str | None = Query(None), status: str | None = Query(None), user: dict = _gate):
    params = {k: v for k, v in {"job_id": job_id, "status": status}.items() if v}
    return _proxy("GET", "/api/admin/applications", params=params)


@router.get("/applications/{application_id}")
def get_application(application_id: int, user: dict = _gate):
    return _proxy("GET", f"/api/admin/applications/{application_id}")


@router.patch("/applications/{application_id}")
def update_application(application_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("PATCH", f"/api/admin/applications/{application_id}", json=body)
