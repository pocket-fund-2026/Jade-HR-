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


def _actor(user: dict | None) -> str | None:
    if not user:
        return None
    name = user.get("name") or f"{user.get('first_name', '')} {user.get('last_name') or ''}".strip()
    return name or user.get("employee_code")


def _careers_token(user: dict | None = None) -> str:
    # "name" is who jade-careers records against notes, interviews and status changes.
    payload = {"id": 1, "email": "careers@jadecouture.com"}
    if _actor(user):
        payload["name"] = _actor(user)
    return jwt.encode(payload, CAREERS_JWT_SECRET, algorithm="HS256")


def _proxy(method: str, path: str, user: dict | None = None, timeout: float = 15, **kwargs) -> dict | list:
    try:
        resp = httpx.request(
            method,
            f"{CAREERS_API_BASE}{path}",
            headers={"Authorization": f"Bearer {_careers_token(user)}"},
            timeout=timeout,
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


@router.put("/jobs/reorder")
def reorder_jobs(body: dict = Body(...), user: dict = _gate):
    return _proxy("PUT", "/api/admin/jobs/reorder", json=body)


@router.put("/jobs/{job_id}")
def update_job(job_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("PUT", f"/api/admin/jobs/{job_id}", json=body)


@router.delete("/jobs/{job_id}")
def delete_job(job_id: int, user: dict = _gate):
    return _proxy("DELETE", f"/api/admin/jobs/{job_id}")


# ---------- Per-job custom application questions ----------
@router.get("/jobs/{job_id}/questions")
def list_questions(job_id: int, user: dict = _gate):
    return _proxy("GET", f"/api/admin/jobs/{job_id}/questions")


@router.post("/jobs/{job_id}/questions")
def create_question(job_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", f"/api/admin/jobs/{job_id}/questions", json=body)


@router.put("/questions/{question_id}")
def update_question(question_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("PUT", f"/api/admin/questions/{question_id}", json=body)


@router.delete("/questions/{question_id}")
def delete_question(question_id: int, user: dict = _gate):
    return _proxy("DELETE", f"/api/admin/questions/{question_id}")


# ---------- Applicants ----------
@router.get("/applications")
def list_applications(
    job_id: str | None = Query(None),
    status: str | None = Query(None),
    verdict: str | None = Query(None),
    search: str | None = Query(None),
    include_auto_rejected: str | None = Query(None),
    user: dict = _gate,
):
    params = {
        k: v
        for k, v in {
            "job_id": job_id,
            "status": status,
            "verdict": verdict,
            "search": search,
            "include_auto_rejected": include_auto_rejected,
        }.items()
        if v
    }
    return _proxy("GET", "/api/admin/applications", params=params)


@router.post("/applications/bulk-status")
def bulk_status(body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", "/api/admin/applications/bulk-status", user=user, json=body)


@router.get("/applications/{application_id}")
def get_application(application_id: int, user: dict = _gate):
    return _proxy("GET", f"/api/admin/applications/{application_id}")


@router.patch("/applications/{application_id}")
def update_application(application_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("PATCH", f"/api/admin/applications/{application_id}", user=user, json=body)


# ---------- Notes, interviews, history ----------
@router.post("/applications/{application_id}/notes")
def add_note(application_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", f"/api/admin/applications/{application_id}/notes", user=user, json=body)


@router.delete("/notes/{note_id}")
def delete_note(note_id: int, user: dict = _gate):
    return _proxy("DELETE", f"/api/admin/notes/{note_id}", user=user)


@router.post("/applications/{application_id}/interviews")
def add_interview(application_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", f"/api/admin/applications/{application_id}/interviews", user=user, json=body)


@router.put("/interviews/{interview_id}")
def update_interview(interview_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("PUT", f"/api/admin/interviews/{interview_id}", user=user, json=body)


@router.delete("/interviews/{interview_id}")
def delete_interview(interview_id: int, user: dict = _gate):
    return _proxy("DELETE", f"/api/admin/interviews/{interview_id}", user=user)


@router.get("/interviews")
def list_interviews(days: int = Query(14), user: dict = _gate):
    return _proxy("GET", "/api/admin/interviews", params={"days": days})


# ---------- Dashboard ----------
@router.get("/stats")
def stats(days: int = Query(0), user: dict = _gate):
    return _proxy("GET", "/api/admin/stats", params={"days": days})


# ---------- Screening rules ----------
@router.get("/screening/config")
def get_screening_config(user: dict = _gate):
    return _proxy("GET", "/api/admin/screening/config")


@router.put("/screening/config")
def save_screening_config(body: dict = Body(...), user: dict = _gate):
    return _proxy("PUT", "/api/admin/screening/config", user=user, json=body)


@router.post("/screening/run")
def run_screening(body: dict = Body(...), user: dict = _gate):
    # Reads every resume PDF, so give it longer than the default.
    return _proxy("POST", "/api/admin/screening/run", user=user, timeout=55, json=body)
