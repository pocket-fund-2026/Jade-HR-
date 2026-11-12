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
same as the paper form being walked around physically today. 2 IT/security
rows (ID Card Return, Email/OMS/TDS Deactivation) were added on top of the
paper form's original 9.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

import email_service
from auth import get_current_user, require_permission
from database import maybe_single_data, supabase
from workflow_log import record_step
from models import (
    LeaverAlert, ExitAssetUpdate, ExitAssetSubmit, ExitChecklistItemUpdate, ExitInitiate, ExitInterviewSubmit,
    ExitSignerCreate, ExitSignoff,
)

router = APIRouter(prefix="/api/exit-records", tags=["exit-procedure"])

# (department, item label) — the Final Settlement Form's original 9 rows,
# plus 2 IT/security rows (identity card return, system account
# deactivation) that weren't on the paper form.
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
]

# Rows that older exit records were created with but that are no longer part of
# the process (Rajendra Power's deactivation sign-off was dropped 2026-11-12).
# They are hidden from the checklist and ignored when finalizing, so an exit
# opened before the change is not stuck waiting for a sign-off nobody gives.
RETIRED_DEPARTMENTS = ("IT (Rajendra Power)",)


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
    items = [i for i in items if i["department"] not in RETIRED_DEPARTMENTS]
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
        r.pop("system_password", None)  # only the single-record view shows it
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
    email_service.notify_access_revocation(
        employee_name, employee.get("employee_code", ""), body.last_working_day.isoformat(), "notice",
        email_service.HR_NOTIFY_EMAIL,
    )

    return _hydrate(record)


def send_access_revocation_if_new(employee_id: str, last_working_day: str, stage: str) -> bool:
    """Email HR (once per person and stage) that the leaver's access to other
    systems must be revoked. Also used when someone is marked Exited from the
    employee profile page without going through Initiate Exit."""
    employee = _employee_brief(employee_id)
    if not employee:
        return False
    code = employee.get("employee_code", "")
    if email_service.access_revocation_already_sent(code, stage):
        return False
    name = f"{employee.get('first_name', '')} {employee.get('last_name', '')}".strip()
    return email_service.notify_access_revocation(name, code, last_working_day, stage, email_service.HR_NOTIFY_EMAIL)


# Checklist rows that mean "their logins are still live".
ACCESS_ITEM_LABELS = ("Email / OMS / TDS Login Deactivation",)


@router.post("/leaver-alert")
def leaver_alert(body: LeaverAlert, user: dict = Depends(require_permission("employees.manage"))):
    """Called by the nightly roster sync with everyone it just found to be no
    longer working. Sends HR one email; returns how many people it named."""
    people = []
    for emp_id in dict.fromkeys(body.employee_ids):
        emp = _employee_brief(emp_id)
        if emp:
            people.append((f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip(), emp.get("employee_code", "")))
    sent = email_service.notify_roster_leavers(people, email_service.HR_NOTIFY_EMAIL)
    return {"people": len(people), "emailed": sent}


@router.get("/access-pending")
def access_pending(user: dict = Depends(require_permission("exit.manage"))):
    """Open exits whose system-access deactivation is not signed off yet.
    Feeds the HR bell and dashboard alert; an item disappears when HR marks
    those checklist rows Completed."""
    exits = supabase.table("hr_exit_records").select("id,employee_id,last_working_day,initiated_at").eq("status", "in_progress").execute().data
    out = []
    for e in exits:
        pending = (
            supabase.table("hr_exit_checklist_items").select("id")
            .eq("exit_id", e["id"]).eq("status", "pending").in_("item_label", list(ACCESS_ITEM_LABELS)).execute().data
        )
        if not pending:
            continue
        emp = _employee_brief(e["employee_id"])
        out.append({
            "id": e["id"],
            "employee_name": f"{emp.get('first_name', '')} {emp.get('last_name', '')}".strip(),
            "employee_code": emp.get("employee_code", ""),
            "last_working_day": e["last_working_day"],
            "created_at": e["initiated_at"],
            "overdue": e["last_working_day"] <= datetime.now(timezone.utc).date().isoformat(),
        })
    out.sort(key=lambda r: r["last_working_day"])
    return out


def exiting_soon_rows(today_iso: str) -> list[dict]:
    """Everyone whose profile carries a Scheduled Exit Date and/or Exit Date but
    who has not actually Exited yet — the "Exiting soon" section. Includes people
    HR has dated by hand on the profile (no exit record yet) and people whose
    exit is already in progress, so nothing dated can fall between the two.
    Filtering is done here rather than in SQL: `employee_status != 'Exited'`
    would silently drop every row whose status is NULL."""
    profiles = (
        supabase.table("hr_employee_profile")
        .select("employee_id,employee_status,scheduled_exit_date,exit_date")
        .or_("scheduled_exit_date.not.is.null,exit_date.not.is.null")
        .execute()
        .data
    ) or []
    profiles = [p for p in profiles if (p.get("employee_status") or "") != "Exited"]
    if not profiles:
        return []
    ids = [p["employee_id"] for p in profiles]
    employees = {
        e["id"]: e for e in (
            supabase.table("hr_employees")
            .select("id,employee_code,first_name,last_name,department,designation,location,is_active")
            .in_("id", ids).execute().data or []
        )
    }
    open_exits = {
        r["employee_id"]: r["id"] for r in (
            supabase.table("hr_exit_records").select("id,employee_id")
            .in_("employee_id", ids).eq("status", "in_progress").execute().data or []
        )
    }
    out = []
    for p in profiles:
        emp = employees.get(p["employee_id"])
        if not emp or not emp.get("is_active"):
            continue
        when = p.get("exit_date") or p.get("scheduled_exit_date")
        out.append({
            "employee_id": p["employee_id"],
            "employee": emp,
            "employee_status": p.get("employee_status") or "",
            "scheduled_exit_date": p.get("scheduled_exit_date"),
            "exit_date": p.get("exit_date"),
            "exit_on": when,
            "overdue": bool(when and when < today_iso),
            "exit_id": open_exits.get(p["employee_id"]),
        })
    out.sort(key=lambda r: r["exit_on"] or "9999-12-31")
    return out


@router.get("/exiting-soon")
def exiting_soon(user: dict = Depends(require_permission("exit.manage"))):
    return exiting_soon_rows(datetime.now(timezone.utc).date().isoformat())


# --- Who e-signs which checklist row ----------------------------------------
# Each department row on the Final Settlement Form is signed by that
# department's HOD. Nobody was ever flagged head_of_department in the profile,
# so the owners are listed explicitly (hr_exit_signers, sql/086) and HR edits
# them on the Exit page. A row with no owner stays HR-typed, exactly as before.
# Until sql/086 is applied the built-in default below keeps Costing working.
SIGNER_DEFAULTS = {"Costing/Purchase": ["14463"]}  # Siyal Jain, HOD Costing (2026-11-12)
DEPARTMENT_HEAD_ROW = "Department Head"  # signed by the HOD of the LEAVER's own department


def _norm(text: str | None) -> str:
    return " ".join((text or "").lower().split())


def _signer_rows() -> list[tuple[str, str, str | None]]:
    """[(row_department, employee_id, scope_department)]"""
    try:
        data = supabase.table("hr_exit_signers").select("row_department,employee_id,scope_department").execute().data or []
        return [(r["row_department"], r["employee_id"], r.get("scope_department")) for r in data]
    except Exception:  # table not created yet
        rows = []
        for dept, codes in SIGNER_DEFAULTS.items():
            emps = supabase.table("hr_employees").select("id").in_("employee_code", codes).execute().data or []
            rows += [(dept, e["id"], None) for e in emps]
        return rows


def _is_signer(user_id: str, item_department: str, leaver_department: str | None, rows) -> bool:
    for dept, emp_id, scope in rows:
        if emp_id != user_id or dept != item_department:
            continue
        if item_department != DEPARTMENT_HEAD_ROW or (scope and _norm(scope) == _norm(leaver_department)):
            return True
    return False


def pending_signoffs_for(user: dict) -> list[dict]:
    """Checklist rows on other people's open exits that this user is the named
    signer for and that are still pending — what the HOD popup lists."""
    rows = [r for r in _signer_rows() if r[1] == user["id"]]
    if not rows:
        return []
    exits = [
        e for e in (supabase.table("hr_exit_records").select("id,employee_id,last_working_day").eq("status", "in_progress").execute().data or [])
        if e["employee_id"] != user["id"]
    ]
    if not exits:
        return []
    items = (
        supabase.table("hr_exit_checklist_items").select("id,exit_id,department,item_label,status")
        .in_("exit_id", [e["id"] for e in exits]).eq("status", "pending").execute().data or []
    )
    leavers = {
        e["id"]: e for e in (
            supabase.table("hr_employees").select("id,employee_code,first_name,last_name,department")
            .in_("id", [e["employee_id"] for e in exits]).execute().data or []
        )
    }
    by_exit = {e["id"]: e for e in exits}
    out = []
    for it in items:
        if it["department"] in RETIRED_DEPARTMENTS:
            continue
        ex = by_exit[it["exit_id"]]
        lv = leavers.get(ex["employee_id"], {})
        if _is_signer(user["id"], it["department"], lv.get("department"), rows):
            out.append({
                "item_id": it["id"], "exit_id": it["exit_id"], "row_department": it["department"], "item_label": it["item_label"],
                "employee_name": f"{lv.get('first_name', '')} {lv.get('last_name') or ''}".strip(),
                "employee_code": lv.get("employee_code", ""), "employee_department": lv.get("department") or "",
                "last_working_day": ex["last_working_day"],
            })
    out.sort(key=lambda r: (r["last_working_day"], r["employee_name"]))
    return out


@router.get("/signers")
def list_signers(user: dict = Depends(require_permission("exit.manage"))):
    rows = []
    try:
        rows = supabase.table("hr_exit_signers").select("*").execute().data or []
    except Exception:
        pass
    ids = list({r["employee_id"] for r in rows})
    people = {
        e["id"]: e for e in (
            supabase.table("hr_employees").select("id,employee_code,first_name,last_name,department").in_("id", ids).execute().data or []
        )
    } if ids else {}
    return {
        "row_departments": list(dict.fromkeys(d for d, _ in CHECKLIST_TEMPLATE)),
        "signers": [{**r, "employee": people.get(r["employee_id"], {})} for r in rows],
        "table_ready": bool(rows) or _signers_table_exists(),
    }


def _signers_table_exists() -> bool:
    try:
        supabase.table("hr_exit_signers").select("id").limit(1).execute()
        return True
    except Exception:
        return False


@router.post("/signers")
def add_signer(body: ExitSignerCreate, user: dict = Depends(require_permission("exit.manage"))):
    if body.row_department not in {d for d, _ in CHECKLIST_TEMPLATE}:
        raise HTTPException(status_code=400, detail="Unknown checklist row")
    if body.row_department == DEPARTMENT_HEAD_ROW and not (body.scope_department or "").strip():
        raise HTTPException(status_code=400, detail="For the Department Head row, say which department this person heads")
    try:
        inserted = supabase.table("hr_exit_signers").insert({
            "row_department": body.row_department, "employee_id": body.employee_id,
            "scope_department": (body.scope_department or "").strip() or None,
        }).execute()
    except Exception:
        raise HTTPException(status_code=503, detail="Sign-off owners are not set up yet — apply sql/086_exit_signoff.sql")
    return inserted.data[0]


@router.delete("/signers/{signer_id}")
def remove_signer(signer_id: str, user: dict = Depends(require_permission("exit.manage"))):
    resp = supabase.table("hr_exit_signers").delete().eq("id", signer_id).execute()
    if not resp.data:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


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
    record_step(
        "exit", exit_id, "step_completed" if body.status == "completed" else "step_reopened", user,
        basis={"item_id": item_id, "signed_by": body.signed_by},
    )
    record = maybe_single_data(supabase.table("hr_exit_records").select("*").eq("id", exit_id).maybe_single().execute())
    return _hydrate(record)


@router.post("/{exit_id}/finalize")
def finalize_exit(exit_id: str, user: dict = Depends(require_permission("exit.manage"))):
    record = maybe_single_data(supabase.table("hr_exit_records").select("*").eq("id", exit_id).maybe_single().execute())
    if not record:
        raise HTTPException(status_code=404, detail="Exit record not found")
    if record["status"] == "completed":
        raise HTTPException(status_code=409, detail="Exit already finalized")
    items = [
        i for i in supabase.table("hr_exit_checklist_items").select("status,department").eq("exit_id", exit_id).execute().data
        if i["department"] not in RETIRED_DEPARTMENTS
    ]
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
    record_step("exit", exit_id, "finalized", user, employee_id=record["employee_id"],
                basis={"last_working_day": record["last_working_day"], "checklist_items": len(items)})

    send_access_revocation_if_new(record["employee_id"], record["last_working_day"], "left")

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


# --- HOD e-sign popup ---------------------------------------------------------
signoff_router = APIRouter(prefix="/api/me/exit-signoffs", tags=["exit-procedure"])


@signoff_router.get("")
def my_pending_signoffs(user: dict = Depends(get_current_user)):
    return pending_signoffs_for(user)


@signoff_router.post("/{item_id}/sign")
def sign_my_signoff(item_id: str, body: ExitSignoff, user: dict = Depends(get_current_user)):
    mine = {p["item_id"]: p for p in pending_signoffs_for(user)}
    pending = mine.get(item_id)
    if not pending:
        raise HTTPException(status_code=403, detail="This sign-off is not assigned to you, or it is already done.")
    full_name = f"{user.get('first_name', '')} {user.get('last_name') or ''}".strip()
    if not body.confirm:
        raise HTTPException(status_code=400, detail="Tick the box to confirm your clearance")
    if _norm(body.typed_name) != _norm(full_name):
        raise HTTPException(status_code=400, detail=f"Type your full name exactly as: {full_name}")
    now = datetime.now(timezone.utc).isoformat()
    supabase.table("hr_exit_checklist_items").update({
        "status": "completed", "signed_by": f"{full_name} (e-signed)", "notes": body.notes.strip(),
        "signed_at": now, "updated_at": now,
    }).eq("id", item_id).eq("status", "pending").execute()
    record_step(
        "exit", pending["exit_id"], "step_esigned", user,
        basis={"item_id": item_id, "row": pending["row_department"], "signed_by": full_name},
    )
    return {"ok": True}


# --- Leaver's own asset / system handover -------------------------------------
assets_router = APIRouter(prefix="/api/me/exit-assets", tags=["exit-procedure"])


@assets_router.get("")
def my_exit_assets(user: dict = Depends(get_current_user)):
    record = _open_exit_for(user["id"])
    if not record:
        return {"has_exit": False}
    return {
        "has_exit": True, "exit_id": record["id"], "last_working_day": record["last_working_day"],
        "system_no": record.get("system_no") or "", "submitted": bool((record.get("system_password") or "").strip()),
    }


@assets_router.post("")
def submit_my_exit_assets(body: ExitAssetSubmit, user: dict = Depends(get_current_user)):
    record = _open_exit_for(user["id"])
    if not record:
        raise HTTPException(status_code=403, detail="This is only available once HR has started your exit process.")
    if not body.system_password.strip():
        raise HTTPException(status_code=400, detail="Your system password is required")
    try:
        supabase.table("hr_exit_records").update({
            "system_no": body.system_no.strip(), "system_password": body.system_password,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", record["id"]).execute()
    except Exception:
        raise HTTPException(status_code=503, detail="This form is not set up yet — ask HR to apply sql/086_exit_signoff.sql")
    record_step("exit", record["id"], "assets_submitted", user, basis={"has_system_no": bool(body.system_no.strip())})  # never log the password
    return {"ok": True}
