"""Onboarding pipeline console + public links. The pipeline itself lives in
onboarding_pipeline.py; this is the HTTP surface around it."""

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

import onboarding_pipeline as pipeline
from auth import require_console, require_permission

router = APIRouter(prefix="/api/onboarding-cases", tags=["onboarding-cases"])
manage = require_permission("onboarding.manage")


class CaseCreate(BaseModel):
    candidate_name: str
    candidate_email: str
    designation: str = ""
    department: str = ""
    date_of_joining: str = ""
    location: str = ""
    mobile: str = ""
    reporting_manager_id: str | None = None
    # The offer was signed on paper / outside the e-sign flow.
    offer_signed_offline: bool = True
    send_nda: bool = True
    test_recipient: str = ""


class CaseUpdate(BaseModel):
    reporting_manager_id: str | None = None
    is_analyst: bool | None = None
    date_of_joining: str | None = None
    status: str | None = None  # active | cancelled
    set_manager: bool = False


class WorkEmail(BaseModel):
    email: str


class BiometricConfirm(BaseModel):
    device_code: str
    methods: list[str] = []
    enrolled_by: str
    note: str = ""


def _case_or_404(case_id: str) -> dict:
    case = pipeline.get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Onboarding case not found")
    return case


@router.get("")
def list_cases(user: dict = Depends(manage)):
    return [pipeline.summary(c) for c in pipeline.list_cases()]


@router.post("")
def create_case(body: CaseCreate, user: dict = Depends(manage)):
    if not pipeline.EMAIL_RE.match(body.candidate_email.strip()):
        raise HTTPException(status_code=400, detail="Enter the joiner's email address")
    if len(body.candidate_name.strip()) < 2:
        raise HTTPException(status_code=400, detail="Enter the joiner's name")
    case = pipeline.create_case(
        candidate_name=body.candidate_name, candidate_email=body.candidate_email, generated_by=user["id"],
        designation=body.designation, department=body.department, date_of_joining=body.date_of_joining,
        location=body.location, mobile=body.mobile, reporting_manager_id=body.reporting_manager_id,
        offer_signed_at=pipeline._now() if body.offer_signed_offline else None, test_recipient=body.test_recipient,
    )
    if body.offer_signed_offline:
        pipeline.log_event(case, "Offer letter marked as signed (outside the e-sign flow)")
    if body.send_nda:
        pipeline.send_nda(case, user["id"])
    pipeline.save_case(case)
    return pipeline.summary(case)


@router.get("/settings")
def get_settings(user: dict = Depends(manage)):
    return pipeline.public_settings()


@router.put("/settings")
def put_settings(body: dict, user: dict = Depends(manage)):
    try:
        return pipeline.save_settings(body, user["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/escalate")
def escalate(dry_run: bool = Query(default=False), user: dict = Depends(require_console)):
    """Daily cron (onboarding_escalation_notify.py) and the console's
    'Check now' button: emails Gaurav every stuck or missed step."""
    return pipeline.escalate(dry_run=dry_run)


@router.get("/{case_id}")
def get_case(case_id: str, user: dict = Depends(manage)):
    return pipeline.summary(_case_or_404(case_id))


@router.put("/{case_id}")
def update_case(case_id: str, body: CaseUpdate, user: dict = Depends(manage)):
    case = _case_or_404(case_id)
    if body.set_manager:
        pipeline.set_manager(case, body.reporting_manager_id)
    if body.is_analyst is not None:
        case["is_analyst"] = body.is_analyst
        pipeline.log_event(case, "Marked as analyst" if body.is_analyst else "Unmarked as analyst")
    if body.date_of_joining is not None:
        case["date_of_joining"] = pipeline.parse_date(body.date_of_joining)
    if body.status in ("active", "cancelled"):
        case["status"] = body.status
        pipeline.log_event(case, "Onboarding cancelled" if body.status == "cancelled" else "Onboarding reopened")
    pipeline.check_completion(case)
    pipeline.save_case(case)
    return pipeline.summary(case)


@router.post("/{case_id}/work-email")
def set_work_email(case_id: str, body: WorkEmail, user: dict = Depends(manage)):
    case = _case_or_404(case_id)
    if case.get("work_email"):
        raise HTTPException(status_code=409, detail="The work email is already set. Use the resend buttons to re-send its emails.")
    try:
        pipeline.set_work_email(case, body.email)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    pipeline.save_case(case)
    return pipeline.summary(case)


RESENDS = {
    "nda": lambda c, u: pipeline.send_nda(c, u["id"]),
    "form": lambda c, u: pipeline.send_form_link(c),
    "biometric": lambda c, u: pipeline.send_biometric_form(c),
    "welcome": lambda c, u: (pipeline.send_slack_invite(c), pipeline.send_welcome(c))[1],
    "analyst_doc": lambda c, u: pipeline.resend_analyst_doc(c),
    "manager": lambda c, u: pipeline.notify_manager(c),
}


@router.post("/{case_id}/resend/{what}")
def resend(case_id: str, what: str, user: dict = Depends(manage)):
    case = _case_or_404(case_id)
    if what not in RESENDS:
        raise HTTPException(status_code=400, detail="Unknown step")
    needs = {"form": "nda_candidate_signed_at", "biometric": "work_email", "welcome": "work_email"}
    if what in needs and not case.get(needs[what]):
        raise HTTPException(status_code=409, detail="That step has not been reached yet")
    if what == "manager":
        case.pop("manager_notified_at", None)
    try:
        RESENDS[what](case, user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    pipeline.check_completion(case)
    pipeline.save_case(case)
    return pipeline.summary(case)


@router.post("/{case_id}/resend-dev")
def resend_dev(case_id: str, user: dict = Depends(manage)):
    from database import maybe_single_data, supabase
    case = _case_or_404(case_id)
    nda = maybe_single_data(supabase.table("hr_generated_letters").select("*").eq("id", case.get("nda_letter_id") or "00000000-0000-0000-0000-000000000000").maybe_single().execute())
    if not nda or nda.get("approval_status") != "awaiting_countersign":
        raise HTTPException(status_code=409, detail="The NDA is not waiting for Dev's signature")
    pipeline.notify_dev(case, nda)
    pipeline.save_case(case)
    return pipeline.summary(case)


# ── public (token) endpoints ────────────────────────────────────────────

@router.get("/form/{token}")
def form_prefill(token: str):
    case = pipeline.case_by_form_token(token)
    if not case or case.get("status") == "cancelled":
        raise HTTPException(status_code=404, detail="This link is not valid. Ask HR for a fresh one.")
    return {**pipeline.prefill(case), "already_submitted": bool(case.get("form_submitted_at"))}


@router.get("/biometric/{token}")
def biometric_view(token: str):
    case = pipeline.case_by_biometric_token(token)
    if not case or not case.get("work_email"):
        raise HTTPException(status_code=404, detail="This link is not valid.")
    return pipeline.biometric_view(case)


@router.post("/biometric/{token}")
def biometric_confirm(token: str, body: BiometricConfirm):
    case = pipeline.case_by_biometric_token(token)
    if not case or not case.get("work_email"):
        raise HTTPException(status_code=404, detail="This link is not valid.")
    try:
        pipeline.biometric_confirm(case, body.device_code, body.methods, body.enrolled_by, body.note)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=409, detail=str(e))
    pipeline.save_case(case)
    return {"ok": True}
