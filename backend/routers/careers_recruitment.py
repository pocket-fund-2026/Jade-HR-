"""Recruitment improvements on top of the careers proxy (routers/careers.py): duplicate CV and recruiter flags, rejection
presets, auto-reject rules, interviewers and their own availability, interview load, offer/onboarding dispatch status
and round-2 notes. Data that the careers pipeline must act on lives in jade-careers; jade-hr adds the employee-aware
parts (who can interview, mail through email_service, dispatch records)."""

import logging

from fastapi import APIRouter, Body, Depends, HTTPException, Query

import careers_dispatch
import careers_support
import email_service
import workflow_log
from auth import get_current_user, require_permission
from database import supabase
from routers.careers import _actor, _proxy, auto_dispatch, dispatch_store, record_dispatch  # noqa: F401

logger = logging.getLogger("jade_hr.careers")
router = APIRouter(prefix="/api/careers", tags=["careers"])
_gate = Depends(require_permission("careers.manage"))


# ---------- Duplicate CVs, recruiter referrals, rejection presets ----------
@router.get("/applications/{application_id}/duplicates")
def application_duplicates(application_id: int, user: dict = _gate):
    return _proxy("GET", f"/api/admin/applications/{application_id}/duplicates")


@router.get("/applications/{application_id}/merge-view")
def application_merge_view(application_id: int, other: int = Query(...), user: dict = _gate):
    return _proxy("GET", f"/api/admin/applications/{application_id}/merge-view", params={"other": other})


@router.post("/applications/{application_id}/flags")
def application_flags(application_id: int, body: dict = Body(...), user: dict = _gate):
    out = _proxy("POST", f"/api/admin/applications/{application_id}/flags", user=user, json=body)
    workflow_log.record_step("careers_flag", application_id, str(body.get("action")), user,
                             basis={k: body.get(k) for k in ("original_id", "recruiter_name") if body.get(k)})
    return out


@router.post("/duplicates/scan")
def duplicates_scan(body: dict = Body(default={}), user: dict = _gate):
    return _proxy("POST", "/api/admin/duplicates/scan", user=user, json=body, timeout=45)


@router.get("/reject-presets")
def reject_presets(user: dict = _gate):
    return _proxy("GET", "/api/admin/reject-presets")


# ---------- Auto-reject rules ----------
@router.get("/screening/rules")
def screening_rules(user: dict = _gate):
    return _proxy("GET", "/api/admin/screening/rules")


@router.post("/screening/rules")
def screening_rule_save(body: dict = Body(...), user: dict = _gate):
    out = _proxy("POST", "/api/admin/screening/rules", user=user, json=body)
    workflow_log.record_step("careers_rule", out.get("id") if isinstance(out, dict) else None, "save", user,
                             basis={"name": body.get("name"), "enabled": bool(body.get("enabled"))})
    return out


@router.delete("/screening/rules/{rule_id}")
def screening_rule_delete(rule_id: int, user: dict = _gate):
    out = _proxy("DELETE", f"/api/admin/screening/rules/{rule_id}", user=user)
    workflow_log.record_step("careers_rule", rule_id, "delete", user)
    return out


@router.post("/screening/rules/dry-run")
def screening_rules_dry_run(body: dict = Body(default={}), user: dict = _gate):
    return _proxy("POST", "/api/admin/screening/rules/dry-run", user=user, json=body, timeout=55)


@router.post("/screening/rules/run")
def screening_rules_run(body: dict = Body(default={}), user: dict = _gate):
    out = _proxy("POST", "/api/admin/screening/rules/run", user=user, json=body, timeout=55)
    if body.get("apply") is True:
        workflow_log.record_step("careers_rule", None, "run_apply", user, basis={"rejected": out.get("rejected") if isinstance(out, dict) else None})
    return out


# ---------- Interviewers, their own availability, interview load ----------
def _manager_ids() -> set[str]:
    ids = {r["leave_approver_id"] for r in supabase.table("hr_employees").select("leave_approver_id").not_.is_("leave_approver_id", "null").execute().data or []}
    try:
        ids |= {r["reporting_to_id"] for r in supabase.table("hr_employee_profile").select("reporting_to_id").not_.is_("reporting_to_id", "null").execute().data or []}
    except Exception:
        logger.warning("could not read reporting_to_id; using leave approvers only")
    return ids


@router.get("/interviewers")
def interviewers(user: dict = _gate):
    """Dropdown source for the interview scheduler: active reporting managers and store managers."""
    emps = supabase.table("hr_employees").select("id,first_name,last_name,email,designation,location,is_active").eq("is_active", True).execute().data or []
    return careers_support.build_interviewers(emps, _manager_ids())


@router.get("/interviewers/me")
def interviewer_me(user: dict = Depends(get_current_user)):
    """Is the signed-in person an interviewer (so the app shows them 'My interview availability')?"""
    me = next((r for r in careers_support.build_interviewers([{**user, "is_active": True}], _manager_ids())), None)
    return {"eligible": bool(me), "reason": me["reason"] if me else None}


@router.get("/my-availability")
def my_availability(user: dict = Depends(get_current_user)):
    rows = _proxy("GET", "/api/admin/availability", user=user)
    return {"email": user.get("email"), "rows": careers_support.own_availability(rows, user.get("email") or "")}


@router.post("/my-availability")
def my_availability_save(body: dict = Body(...), user: dict = Depends(get_current_user)):
    rows = _proxy("GET", "/api/admin/availability", user=user)
    try:
        fenced = careers_support.fence_availability_body(body, user, rows)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return _proxy("POST", "/api/admin/availability", user=user, json=fenced)


@router.delete("/my-availability/{avail_id}")
def my_availability_delete(avail_id: int, user: dict = Depends(get_current_user)):
    rows = _proxy("GET", "/api/admin/availability", user=user)
    if not careers_support.owns_availability(rows, user.get("email") or "", avail_id):
        raise HTTPException(status_code=403, detail="That is not your availability")
    return _proxy("DELETE", f"/api/admin/availability/{avail_id}", user=user)


@router.get("/availability/open")
def availability_open(email: str = Query(...), user: dict = _gate):
    return _proxy("GET", "/api/admin/availability/open", params={"email": email})


@router.get("/interviews/daily-load")
def interviews_daily_load(days: int = Query(14), user: dict = _gate):
    return _proxy("GET", "/api/admin/interviews/daily-load", params={"days": days})


# ---------- Offer + onboarding dispatch status ----------
@router.get("/applications/{application_id}/dispatch")
def dispatch_status(application_id: int, user: dict = _gate):
    try:
        return careers_dispatch.view(dispatch_store().get(application_id))
    except Exception:
        return {**careers_dispatch.view(None), "state": "unavailable", "note": "sql/093 has not been applied"}


@router.post("/applications/{application_id}/dispatch/resend")
def dispatch_resend(application_id: int, body: dict = Body(default={}), user: dict = _gate):
    app = _proxy("GET", f"/api/admin/applications/{application_id}")["application"]
    only = body.get("only") if body.get("only") in ("offer", "onboarding") else None
    out = careers_dispatch.dispatch(
        {"id": application_id, "full_name": app.get("full_name"), "email": app.get("email")}, dispatch_store(),
        actor=_actor(user) or "hr", force=True, only=only,
    )
    record_dispatch(application_id, user, out)
    return out


# ---------- Round-2 context ----------
@router.get("/applications/{application_id}/round2")
def round2_get(application_id: int, user: dict = _gate):
    return _proxy("GET", f"/api/admin/applications/{application_id}/round2")


@router.put("/applications/{application_id}/round2")
def round2_save(application_id: int, body: dict = Body(...), user: dict = _gate):
    return _proxy("PUT", f"/api/admin/applications/{application_id}/round2", user=user, json=body)


@router.post("/applications/{application_id}/round2/email")
def round2_email(application_id: int, body: dict = Body(...), user: dict = _gate):
    """Email the round-2 notes to a colleague (must be an active employee) through email_service."""
    to = (body.get("to_email") or "").strip().lower()
    if not careers_support.EMAIL_RE.match(to):
        raise HTTPException(status_code=400, detail="Pick a colleague to send the notes to")
    found = supabase.table("hr_employees").select("id").eq("email", to).eq("is_active", True).limit(1).execute().data
    if not found:
        raise HTTPException(status_code=400, detail="That address does not belong to an active employee")
    ctx = _proxy("GET", f"/api/admin/applications/{application_id}/round2")
    if not (ctx.get("notes") or ctx.get("source_url")):
        raise HTTPException(status_code=400, detail="Save the interview notes first")
    detail = _proxy("GET", f"/api/admin/applications/{application_id}")
    subject, text = careers_support.compose_round2_email(
        candidate=detail["application"].get("full_name") or "the candidate", role=(detail.get("job") or {}).get("title") or "",
        notes=ctx.get("notes") or "", source_label=ctx.get("source_label"), source_url=ctx.get("source_url"),
        sender=_actor(user) or "HR", message=body.get("message") or "",
    )
    ok, err = email_service.send_email_detailed(to, subject, text, kind="careers_round2_notes", reply_to=user.get("email") or None)
    if not ok:
        raise HTTPException(status_code=502, detail=f"The email could not be sent ({err})")
    _proxy("POST", f"/api/admin/applications/{application_id}/round2/emailed", user=user, json={"to": to})
    workflow_log.record_step("careers_round2", application_id, "emailed", user, basis={"to_employee": found[0]["id"]})
    return {"ok": True, "to": to}
