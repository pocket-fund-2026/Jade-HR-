"""Exit procedure — the tracked version of the paper "Final Settlement Form"
(a 9-department clearance checklist) plus the Employee Exit Interview Form.

An exit record is created via "Initiate Exit" on the employee page
(resignation_date + last_working_day), which also flips
hr_employee_profile.employee_status to "On Notice" and sets
scheduled_exit_date — the same fields routers/clocks.py's Notice-period
clock already reads, so the countdown and digest pick this up immediately
with no separate wiring. Finalizing the exit (all 9 checklist items
completed) flips employee_status to "Exited" and sets exit_date — matching
exactly what HR could already type in by hand on the Employee page, just
now driven by a workflow instead of a memory of doing it.

The 9 departments named on the paper form (Finished Goods, Raw Material,
Costing/Purchase, Operations, Admin, Audit, plus Department Head/Accounts/HR)
have no logins of their own in jade-hr (CONSOLE_ROLES is just accounts/hr),
so their sign-off is tracked by HR/Accounts typing in who signed and when —
same as the paper form being walked around physically today. 3 IT/security
rows (ID Card Return, Email/OMS/TDS Deactivation, IT Sign-off) were added on
top of the paper form's original 9 — Rajendra Power (outsourced IT) has no
jade-hr login either, so their sign-off is tracked the same way.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

import email_service
from auth import get_current_user, require_permission
from database import maybe_single_data, supabase
from models import ExitAssetUpdate, ExitChecklistItemUpdate, ExitInitiate, ExitInterviewSubmit

router = APIRouter(prefix="/api/exit-records", tags=["exit-procedure"])

# (department, item label) — the Final Settlement Form's original 9 rows,
# plus 3 IT/security rows (identity card return, system account
# deactivation, and outsourced-IT sign-off) that weren't on the paper form.
CHECKLIST_TEMPLATE = [
    ("Finished Goods", "Material"),
    ("Raw Material", "Material(s)"),
    ("Costing/Purchase", "Jobber Bill"),
    ("Department Head", "Handover"),
    ("Accounts", "Payment (Voucher/Loan Status)"),
    ("Operations", "Status"),
    ("Admin", "Equipment"),
    ("Audit", "Status"),
    ("HR", "Status"),
    ("Admin", "Identity Card Return"),
    ("IT", "Email / OMS / TDS Login Deactivation"),
    ("IT (Rajendra Power)", "Deactivation Sign-off"),
]


def _employee_brief(employee_id: str) -> dict:
    resp = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,department,location,email,is_active")
        .eq("id", employee_id)
        .maybe_single()
        .execute()
    )
    return maybe_single_data(resp) or {}


def _hydrate(record: dict) -> dict:
    items = (
        supabase.table("hr_exit_checklist_items")
        .select("*")
        .eq("exit_id", record["id"])
        .order("sort_order")
        .execute()
        .data
    )
    interview_resp = (
        supabase.table("hr_exit_interviews").select("*").eq("exit_id", record["id"]).maybe_single().execute()
    )
    employee = _employee_brief(record["employee_id"])
    return {
        **record,
        "employee": employee,
        "checklist": items,
        "interview": maybe_single_data(interview_resp),
        "all_completed": bool(items) and all(i["status"] == "completed" for i in items),
    }


@router.get("")
def list_exit_records(
    status: str | None = Query(default=None), user: dict = Depends(require_permission("exit.manage"))
):
    query = supabase.table("hr_exit_records").select("*").order("initiated_at", desc=True)
    if status:
        query = query.eq("status", status)
    records = query.execute().data
    employees = {e["id"]: e for e in (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,department,location")
        .in_("id", [r["employee_id"] for r in records])
        .execute()
        .data
    )} if records else {}
    for r in records:
        r["employee"] = employees.get(r["employee_id"], {})
    return records


@router.post("")
def initiate_exit(body: ExitInitiate, user: dict = Depends(require_permission("exit.manage"))):
    if body.last_working_day < body.resignation_date:
        raise HTTPException(status_code=400, detail="Last working day must be on or after the resignation date")

    employee = _employee_brief(body.employee_id)
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    existing_open = (
        supabase.table("hr_exit_records")
        .select("id")
        .eq("employee_id", body.employee_id)
        .eq("status", "in_progress")
        .execute()
        .data
    )
    if existing_open:
        raise HTTPException(status_code=409, detail="This employee already has an exit in progress")

    now = datetime.now(timezone.utc).isoformat()
    inserted = supabase.table("hr_exit_records").insert({
        "employee_id": body.employee_id,
        "resignation_date": body.resignation_date.isoformat(),
        "last_working_day": body.last_working_day.isoformat(),
        "initiated_by": user["id"],
        "initiated_at": now,
    }).execute()
    record = inserted.data[0]

    supabase.table("hr_exit_checklist_items").insert([
        {"exit_id": record["id"], "department": dept, "item_label": label, "sort_order": i}
        for i, (dept, label) in enumerate(CHECKLIST_TEMPLATE)
    ]).execute()

    # Same fields routers/clocks.py's Notice-period clock reads — the exit
    # immediately shows up there, no separate wiring needed.
    supabase.table("hr_employee_profile").upsert(
        {
            "employee_id": body.employee_id,
            "employee_status": "On Notice",
            "scheduled_exit_date": body.last_working_day.isoformat(),
            "updated_at": now,
        },
        on_conflict="employee_id",
    ).execute()

    employee_name = f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip()
    email_service.notify_exit_initiated(
        employee_name, employee.get("employee_code", ""),
        body.resignation_date.isoformat(), body.last_working_day.isoformat(),
        email_service.HR_NOTIFY_EMAIL,
    )

    return _hydrate(record)


@router.get("/{exit_id}")
def get_exit_record(exit_id: str, user: dict = Depends(require_permission("exit.manage"))):
    resp = supabase.table("hr_exit_records").select("*").eq("id", exit_id).maybe_single().execute()
    record = maybe_single_data(resp)
    if not record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    return _hydrate(record)


@router.put("/{exit_id}")
def update_exit_assets(exit_id: str, body: ExitAssetUpdate, user: dict = Depends(require_permission("exit.manage"))):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    updates["updated_at"] = datetime.now(timezone.utc).isoformat()
    resp = supabase.table("hr_exit_records").update(updates).eq("id", exit_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Exit record not found")
    return _hydrate(resp.data[0])


@router.put("/{exit_id}/checklist/{item_id}")
def update_checklist_item(
    exit_id: str, item_id: str, body: ExitChecklistItemUpdate, user: dict = Depends(require_permission("exit.manage"))
):
    if body.status not in ("pending", "completed"):
        raise HTTPException(status_code=400, detail="status must be 'pending' or 'completed'")
    updates = {
        "status": body.status,
        "signed_by": body.signed_by,
        "notes": body.notes,
        "signed_at": datetime.now(timezone.utc).isoformat() if body.status == "completed" else None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    resp = (
        supabase.table("hr_exit_checklist_items")
        .update(updates)
        .eq("id", item_id)
        .eq("exit_id", exit_id)
        .execute()
    )
    if not resp.data:
        raise HTTPException(status_code=404, detail="Checklist item not found")
    record = maybe_single_data(supabase.table("hr_exit_records").select("*").eq("id", exit_id).maybe_single().execute())
    return _hydrate(record)


@router.post("/{exit_id}/finalize")
def finalize_exit(exit_id: str, user: dict = Depends(require_permission("exit.manage"))):
    record = maybe_single_data(supabase.table("hr_exit_records").select("*").eq("id", exit_id).maybe_single().execute())
    if not record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    if record["status"] == "completed":
        raise HTTPException(status_code=409, detail="Exit already finalized")
    items = supabase.table("hr_exit_checklist_items").select("status").eq("exit_id", exit_id).execute().data
    if not items or any(i["status"] != "completed" for i in items):
        raise HTTPException(status_code=409, detail="Every department must be marked Completed before finalizing")

    now = datetime.now(timezone.utc).isoformat()
    supabase.table("hr_exit_records").update({
        "status": "completed", "completed_by": user["id"], "completed_at": now, "updated_at": now,
    }).eq("id", exit_id).execute()
    supabase.table("hr_employee_profile").upsert(
        {"employee_id": record["employee_id"], "employee_status": "Exited", "exit_date": record["last_working_day"], "updated_at": now},
        on_conflict="employee_id",
    ).execute()

    updated = maybe_single_data(supabase.table("hr_exit_records").select("*").eq("id", exit_id).maybe_single().execute())
    return _hydrate(updated)


def _upsert_interview(exit_id: str, body: ExitInterviewSubmit, submitted_by: str) -> dict:
    exists = supabase.table("hr_exit_interviews").select("id").eq("exit_id", exit_id).maybe_single().execute()
    now = datetime.now(timezone.utc).isoformat()
    row = {
        "exit_id": exit_id,
        **body.model_dump(),
        "submitted_by": submitted_by,
        "submitted_at": now,
        "updated_at": now,
    }
    if maybe_single_data(exists):
        resp = supabase.table("hr_exit_interviews").update(row).eq("exit_id", exit_id).execute()
    else:
        resp = supabase.table("hr_exit_interviews").insert(row).execute()
    return resp.data[0]


def _open_exit_for(employee_id: str) -> dict | None:
    resp = (
        supabase.table("hr_exit_records")
        .select("*")
        .eq("employee_id", employee_id)
        .eq("status", "in_progress")
        .execute()
    )
    return resp.data[0] if resp.data else None


# --- Employee self-service -------------------------------------------------
# The exit interview is filled in by the RESIGNING EMPLOYEE, not by HR (HR
# instruction, 10 Sept 2026) — these two endpoints are the only way it gets
# written, and they're gated on the caller having an exit of their own
# in progress. HR's own view of it (via GET /{exit_id} above) is read-only.

me_router = APIRouter(prefix="/api/me/exit-interview", tags=["exit-procedure"])


@me_router.get("")
def my_exit_interview(user: dict = Depends(get_current_user)):
    """Whether the signed-in employee has an exit in progress and, if so,
    their own interview answers so far. Returns has_exit=False for everyone
    who hasn't resigned — the form never appears for them."""
    record = _open_exit_for(user["id"])
    if not record:
        return {"has_exit": False}
    interview = maybe_single_data(
        supabase.table("hr_exit_interviews").select("*").eq("exit_id", record["id"]).maybe_single().execute()
    )
    return {
        "has_exit": True,
        "exit_id": record["id"],
        "resignation_date": record["resignation_date"],
        "last_working_day": record["last_working_day"],
        "submitted": interview is not None,
        "interview": interview,
    }


@me_router.post("")
def submit_my_exit_interview(body: ExitInterviewSubmit, user: dict = Depends(get_current_user)):
    record = _open_exit_for(user["id"])
    if not record:
        raise HTTPException(
            status_code=403,
            detail="The exit interview is only available once HR has started your exit process.",
        )
    return _upsert_interview(record["id"], body, user["id"])
