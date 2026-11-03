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


@router.post("/interviews/{interview_id}/resend")
def resend_interview(interview_id: int, user: dict = _gate):
    return _proxy("POST", f"/api/admin/interviews/{interview_id}/resend", user=user, json={})


@router.get("/inbox")
def inbox_list(q: str = "", matched: str = "", user: dict = _gate):
    return _proxy("GET", "/api/admin/inbox", user=user, params={"q": q, "matched": matched})


@router.get("/inbox/status")
def inbox_status(user: dict = _gate):
    return _proxy("GET", "/api/admin/inbox/status", user=user)


@router.post("/inbox/sync")
def inbox_sync(user: dict = _gate):
    return _proxy("POST", "/api/admin/inbox/sync", user=user, json={}, timeout=60)


@router.get("/availability")
def availability_list(user: dict = _gate):
    return _proxy("GET", "/api/admin/availability", user=user)


@router.post("/availability")
def availability_save(body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", "/api/admin/availability", user=user, json=body)


@router.delete("/availability/{avail_id}")
def availability_delete(avail_id: int, user: dict = _gate):
    return _proxy("DELETE", f"/api/admin/availability/{avail_id}", user=user)


@router.post("/availability/suggest")
def availability_suggest(body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", "/api/admin/availability/suggest", user=user, json=body, timeout=30)


@router.get("/agents")
def agents_list(user: dict = _gate):
    return _proxy("GET", "/api/admin/agents", user=user)


@router.post("/agents/{agent_id}")
def agents_toggle(agent_id: str, body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", f"/api/admin/agents/{agent_id}", user=user, json=body)


@router.get("/applications/{application_id}/offers")
def offers_list(application_id: int, user: dict = _gate):
    return _proxy("GET", f"/api/admin/applications/{application_id}/offers", user=user)


@router.post("/applications/{application_id}/offers")
def offers_create(application_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", f"/api/admin/applications/{application_id}/offers", user=user, json=body)


@router.post("/offers/{offer_id}/cancel")
def offers_cancel(offer_id: int, user: dict = _gate):
    return _proxy("POST", f"/api/admin/offers/{offer_id}/cancel", user=user, json={})


@router.post("/offers/{offer_id}/resend")
def offers_resend(offer_id: int, user: dict = _gate):
    return _proxy("POST", f"/api/admin/offers/{offer_id}/resend", user=user, json={})


@router.get("/agent/status")
def agent_status(user: dict = _gate):
    return _proxy("GET", "/api/admin/agent/status", user=user)


@router.post("/agent/run")
def agent_run(user: dict = _gate):
    return _proxy("POST", "/api/admin/agent/run", user=user, json={}, timeout=120)


@router.post("/agent/requeue")
def agent_requeue(user: dict = _gate):
    return _proxy("POST", "/api/admin/agent/requeue", user=user, json={})


@router.post("/inbox/{msg_id}/create-applicant")
def inbox_create_applicant(msg_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", f"/api/admin/inbox/{msg_id}/create-applicant", user=user, json=body)


@router.post("/inbox/{msg_id}/dismiss")
def inbox_dismiss(msg_id: int, body: dict = Body(default={}), user: dict = _gate):
    return _proxy("POST", f"/api/admin/inbox/{msg_id}/dismiss", user=user, json=body)


@router.post("/calendar/check")
def calendar_check(body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", "/api/admin/calendar/check", user=user, json=body, timeout=30)


@router.get("/inbox/{msg_id}")
def inbox_get(msg_id: int, user: dict = _gate):
    return _proxy("GET", f"/api/admin/inbox/{msg_id}", user=user)


@router.post("/mail/send")
def mail_send(body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", "/api/admin/mail/send", user=user, json=body)


@router.get("/mail/status")
def mail_status(user: dict = _gate):
    return _proxy("GET", "/api/admin/mail/status", user=user)


@router.post("/mail/{mail_id}/send-shortlist")
def mail_send_shortlist(mail_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("POST", f"/api/admin/mail/{mail_id}/send-shortlist", user=user, json=body)


@router.get("/mail/{mail_id}")
def mail_get(mail_id: int, user: dict = _gate):
    return _proxy("GET", f"/api/admin/mail/{mail_id}", user=user)


@router.put("/mail/{mail_id}/draft")
def mail_draft_update(mail_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("PUT", f"/api/admin/mail/{mail_id}/draft", user=user, json=body)


@router.post("/mail/{mail_id}/send")
def mail_draft_send(mail_id: int, user: dict = _gate):
    return _proxy("POST", f"/api/admin/mail/{mail_id}/send", user=user, json={})


@router.delete("/mail/{mail_id}/draft")
def mail_draft_discard(mail_id: int, user: dict = _gate):
    return _proxy("DELETE", f"/api/admin/mail/{mail_id}/draft", user=user)


@router.post("/mail/{mail_id}/retry")
def mail_retry(mail_id: int, user: dict = _gate):
    return _proxy("POST", f"/api/admin/mail/{mail_id}/retry", user=user, json={})


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
