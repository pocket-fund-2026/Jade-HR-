"""Append-only step log for the console's multi-step workflows (sql/078).

Each approval, rejection or checklist step writes one row: who did it, in what
role, when, and the facts the decision rested on. It answers "who approved
this, and on what basis" without reading five different tables, and it is the
shared place to look when a workflow is stuck.

Same contract as activity.py: recording is best-effort. A failure to write the
log must never fail the approval it describes, so every error is swallowed and
only logged. The log is never edited or deleted by the app."""

import logging

from database import supabase

logger = logging.getLogger("jade_hr.workflow_log")

WORKFLOWS = {
    "leave": "Leave request",
    "comp_off": "Comp-Off grant",
    "payslip_approval": "Payslip approval",
    "loan": "Loan request",
    "onboarding": "Onboarding",
    "exit": "Exit procedure",
    "aip": "Attendance Improvement Plan",
    "quarter_red_card": "Quarter Red Card",
    "dispute": "Attendance dispute",
    "attendance_override": "Attendance correction",
    "wfh": "Work From Home",
    "absence": "Work absence",
    "market_visit": "Market visit",
}


def record_step(
    workflow: str,
    subject_id,
    action: str,
    actor: dict | None,
    *,
    employee_id=None,
    basis: dict | None = None,
    note: str = "",
) -> None:
    """subject_id: id of the request/record the step belongs to.
    action: what happened (approve, reject, step_completed, finalized, ...).
    basis: the facts the decision rested on, stored as given (keep it small
    and free of personal data such as salary or ID numbers)."""
    try:
        supabase.table("hr_workflow_events").insert({
            "workflow": workflow,
            "subject_id": str(subject_id) if subject_id is not None else None,
            "employee_id": str(employee_id) if employee_id else None,
            "action": action,
            "actor_id": (actor or {}).get("id"),
            "actor_role": (actor or {}).get("role") or "system",
            "basis": basis or {},
            "note": (note or "")[:500],
        }).execute()
    except Exception:
        logger.exception("workflow log write failed (%s %s %s)", workflow, subject_id, action)
