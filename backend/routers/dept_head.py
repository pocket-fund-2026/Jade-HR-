"""Change the status of items ALREADY decided (disputes, leave, work-related absence), after the fact.
Who may change what:
  - Accounts (super admin): everything.
  - HR with the matching permission (leave.manage / disputes.manage / absence.manage): everything of that kind.
  - A reporting manager: their own team's items.
  - A department head (hr_employee_profile.head_of_department): everyone in their department.
Nobody can change their own items. Every change needs a reason, is written to the workflow log, and the
employee is emailed."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

import email_service
from auth import get_current_user, my_report_ids, require_permission, user_can
from database import maybe_single_data, supabase
from workflow_log import record_step

router = APIRouter(prefix="/api/dept-head", tags=["dept-head"])

WINDOW_DAYS = 120


def _profile_flag(user_id: str) -> bool:
    row = maybe_single_data(supabase.table("hr_employee_profile").select("head_of_department").eq("employee_id", user_id).maybe_single().execute())
    return bool(row and row.get("head_of_department"))


PERM_BY_KIND = {"disputes": "disputes.manage", "leave": "leave.manage", "absence": "absence.manage"}


# Store managers who are also the Retail head and legitimately see every store
# (Karishma Rewari, 14014). Any other store manager is limited to their reportees.
ALL_STORES_HEADS = {"14014"}


def head_scope(user: dict) -> tuple[bool, str | None]:
    """(is a department head, their department).

    Store managers are never department-wide heads: a Retail "department" spans
    every city, so a flagged store manager (e.g. Ahmedabad) would see other
    stores' (Delhi's) items. They keep only their own reportees via
    my_report_ids."""
    if "store manager" in (user.get("designation") or "").lower() and user.get("employee_code") not in ALL_STORES_HEADS:
        return False, None
    if _profile_flag(user["id"]) and (user.get("department") or "").strip():
        return True, user["department"].strip()
    return False, None


def scope_ids(user: dict, kind: str) -> set[str] | None:
    """Employee ids whose decided items this user may change; None means everyone."""
    if user.get("role") == "accounts":
        return None
    if user.get("role") == "hr" and user_can(user, PERM_BY_KIND[kind]):
        return None
    ids = set(my_report_ids(user))
    head, dept = head_scope(user)
    if head:
        ids |= set(_dept_member_ids(dept))
    ids.discard(user["id"])
    return ids


def require_reviser(user: dict = Depends(get_current_user)) -> dict:
    return user


def _dept_member_ids(dept: str | None) -> list[str]:
    q = supabase.table("hr_employees").select("id").eq("is_active", True)
    if dept:
        q = q.eq("department", dept)
    return [r["id"] for r in q.execute().data]


def _check_target(user: dict, kind: str, employee_id: str) -> None:
    if employee_id == user["id"]:
        raise HTTPException(status_code=403, detail="You cannot change your own items — another reviewer must")
    scope = scope_ids(user, kind)
    if scope is not None and employee_id not in scope:
        raise HTTPException(status_code=403, detail="You can only change decisions for your own team or department")


@router.get("/status")
def head_status(user: dict = Depends(get_current_user)):
    head, dept = head_scope(user)
    can = user.get("role") in ("accounts", "hr") or head or bool(my_report_ids(user))
    return {"is_head": head, "can_change": can, "department": dept or ("All" if user.get("role") in ("accounts", "hr") else "Your team")}


TABLES = {
    "disputes": ("hr_attendance_disputes", "*, hr_employees!hr_attendance_disputes_employee_id_fkey(first_name,last_name,employee_code,department)", "date"),
    "leave": ("hr_leave_requests", "*, hr_employees!hr_leave_requests_employee_id_fkey(first_name,last_name,employee_code,department)", "start_date"),
    "absence": ("hr_absence_requests", "*", "start_date"),
}


@router.get("/items")
def items(kind: str = Query(...), status: str | None = Query(None), user: dict = Depends(get_current_user)):
    if kind not in TABLES:
        raise HTTPException(status_code=400, detail="kind must be disputes, leave or absence")
    table, select, datecol = TABLES[kind]
    scope = scope_ids(user, kind)
    if scope is not None and not scope:
        raise HTTPException(status_code=403, detail="You do not have anyone's decisions to change")
    since = (datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)).date().isoformat()
    out: list[dict] = []
    if scope is None:
        q = supabase.table(table).select(select).gte(datecol, since).neq("status", "pending")
        if status:
            q = q.eq("status", status)
        out = q.order(datecol, desc=True).limit(400).execute().data
    else:
        ids = list(scope)
        for i in range(0, len(ids), 80):
            q = supabase.table(table).select(select).in_("employee_id", ids[i:i + 80]).gte(datecol, since).neq("status", "pending")
            if status:
                q = q.eq("status", status)
            out += q.execute().data
    out = [r for r in out if r["employee_id"] != user["id"]]
    out.sort(key=lambda r: r.get(datecol) or "", reverse=True)
    return out[:300]


class Revise(BaseModel):
    action: str  # approve | reject
    note: str = ""
    first_in: str | None = None
    last_out: str | None = None
    last_out_date: str | None = None
    status_override: str = "present"


def _notify(employee_id: str, what: str, outcome: str, note: str) -> None:
    try:
        e = maybe_single_data(supabase.table("hr_employees").select("email,first_name").eq("id", employee_id).maybe_single().execute()) or {}
        if e.get("email"):
            email_service.send_email(
                e["email"], f"Your {what} was changed to {outcome}",
                f"Hi {e.get('first_name') or 'there'},\n\nYour department head changed the decision on your {what}: it is now {outcome}."
                + (f"\n\nNote: {note}" if note else "") + "\n\nHR, JADE Lifestyles India", kind="dept_head_change")
    except Exception:
        pass


def _guard(body: Revise, current: str) -> str:
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")
    new = "approved" if body.action == "approve" else "rejected"
    if current == "pending":
        raise HTTPException(status_code=409, detail="Still pending: decide it from the normal queue")
    if current == new:
        raise HTTPException(status_code=400, detail=f"It is already {new}")
    return new


@router.put("/disputes/{dispute_id}")
def revise_dispute(dispute_id: str, body: Revise, user: dict = Depends(get_current_user)):
    d = maybe_single_data(supabase.table("hr_attendance_disputes").select("*").eq("id", dispute_id).maybe_single().execute())
    if not d:
        raise HTTPException(status_code=404, detail="Dispute not found")
    _check_target(user, "disputes", d["employee_id"])
    new = _guard(body, d["status"])
    now = datetime.now(timezone.utc).isoformat()
    iso = lambda t: t if isinstance(t, str) or t is None else t.isoformat()
    supabase.table("hr_dispute_actions").delete().eq("dispute_id", dispute_id).execute()
    first_in, last_out = body.first_in or d.get("claimed_in"), body.last_out or d.get("claimed_out")
    supabase.table("hr_dispute_actions").insert({
        "dispute_id": dispute_id, "actor_id": user["id"], "actor_role": "manager", "action": body.action, "note": body.note,
        "first_in": iso(first_in), "last_out": iso(last_out), "status_override": body.status_override if new == "approved" else None,
    }).execute()
    if new == "approved":
        row = {"employee_id": d["employee_id"], "date": d["date"], "status_override": body.status_override, "first_in": iso(first_in),
               "last_out": iso(last_out), "note": f"Approved dispute (changed later): {d['reason']}", "created_by": user["id"]}
        out_date = body.last_out_date or d.get("claimed_out_date")
        if out_date and str(out_date)[:10] != str(d["date"])[:10]:
            row["last_out_date"] = str(out_date)[:10]
        try:
            supabase.table("hr_attendance_overrides").upsert(row, on_conflict="employee_id,date").execute()
        except Exception as e:
            if "last_out_date" not in str(e):
                raise
            row.pop("last_out_date", None)
            supabase.table("hr_attendance_overrides").upsert(row, on_conflict="employee_id,date").execute()
    else:
        (supabase.table("hr_attendance_overrides").delete().eq("employee_id", d["employee_id"]).eq("date", d["date"])
         .like("note", "Approved dispute%").execute())
    supabase.table("hr_attendance_disputes").update({
        "status": new, "admin_note": body.note or d.get("admin_note"), "resolved_by": user["id"], "resolved_by_role": "manager", "resolved_at": now,
    }).eq("id", dispute_id).execute()
    record_step("dispute", dispute_id, f"head_changed_to_{new}", user, employee_id=d["employee_id"],
                basis={"date": str(d["date"])[:10], "was": d["status"]}, note=body.note or "")
    _notify(d["employee_id"], "attendance dispute", new, body.note)
    return {"ok": True, "status": new}


@router.put("/leave/{request_id}")
def revise_leave(request_id: str, body: Revise, user: dict = Depends(get_current_user)):
    r = maybe_single_data(supabase.table("hr_leave_requests").select("*").eq("id", request_id).maybe_single().execute())
    if not r:
        raise HTTPException(status_code=404, detail="Leave request not found")
    _check_target(user, "leave", r["employee_id"])
    new = _guard(body, r["status"])
    if r["leave_type"] == "comp_off":
        # Comp-Off leave draws on the person's ledger: approving uses credits, undoing an approval gives them back.
        from routers.leave import _consume_comp_off, _days_in_range, _validate_comp_off_dates
        today_iso = datetime.now(timezone.utc).astimezone().date().isoformat()
        if new == "approved":
            employee = maybe_single_data(supabase.table("hr_employees").select("*").eq("id", r["employee_id"]).maybe_single().execute())
            end = datetime.fromisoformat(r["end_date"]).date()
            _validate_comp_off_dates(employee, datetime.fromisoformat(r["start_date"]).date(), end, request_id)
            if not _consume_comp_off(r["employee_id"], _days_in_range(r["start_date"], r["end_date"]), request_id, end):
                raise HTTPException(status_code=409, detail="The person's Comp-Off balance no longer covers this leave")
        else:
            used = supabase.table("hr_comp_off_ledger").select("id,expiry_date").eq("used_in_leave_request_id", request_id).execute().data
            back = [u["id"] for u in used if u["expiry_date"] >= today_iso]
            gone = [u["id"] for u in used if u["expiry_date"] < today_iso]
            if back:
                supabase.table("hr_comp_off_ledger").update({"status": "available", "used_in_leave_request_id": None}).in_("id", back).execute()
            if gone:
                supabase.table("hr_comp_off_ledger").update({"status": "expired", "used_in_leave_request_id": None}).in_("id", gone).execute()
    supabase.table("hr_leave_requests").update({
        "status": new, "admin_note": body.note or r.get("admin_note"), "resolved_by": user["id"],
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()
    record_step("leave", request_id, f"head_changed_to_{new}", user, employee_id=r["employee_id"],
                basis={"leave_type": r["leave_type"], "start": r["start_date"], "end": r["end_date"], "was": r["status"]}, note=body.note or "")
    _notify(r["employee_id"], "leave request", new, body.note)
    return {"ok": True, "status": new}


@router.put("/absence/{request_id}")
def revise_absence(request_id: str, body: Revise, user: dict = Depends(get_current_user)):
    r = maybe_single_data(supabase.table("hr_absence_requests").select("*").eq("id", request_id).maybe_single().execute())
    if not r:
        raise HTTPException(status_code=404, detail="Absence request not found")
    _check_target(user, "absence", r["employee_id"])
    new = _guard(body, r["status"])
    supabase.table("hr_absence_requests").update({
        "status": new, "admin_note": body.note or r.get("admin_note"), "resolved_by": user["id"],
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()
    record_step("absence", request_id, f"head_changed_to_{new}", user, employee_id=r["employee_id"],
                basis={"start": r["start_date"], "end": r["end_date"], "was": r["status"]}, note=body.note or "")
    _notify(r["employee_id"], "work-related absence", new, body.note)
    return {"ok": True, "status": new}


# --- Who the heads are --------------------------------------------------------------------
@router.get("/proposals")
def proposals(user: dict = Depends(require_permission("employees.manage"))):
    """Per department, the person most of its members report to, as a starting list to confirm."""
    emps = supabase.table("hr_employees").select("id,employee_code,first_name,last_name,department").eq("is_active", True).execute().data
    by_id = {e["id"]: e for e in emps}
    prof = supabase.table("hr_employee_profile").select("employee_id,reporting_to_id,head_of_department").execute().data
    flagged = {p["employee_id"] for p in prof if p.get("head_of_department")}
    counts: dict[str, dict[str, int]] = {}
    for p in prof:
        e, m = by_id.get(p["employee_id"]), by_id.get(p.get("reporting_to_id") or "")
        if e and m and (e.get("department") or "").strip():
            counts.setdefault(e["department"].strip(), {})[m["id"]] = counts.setdefault(e["department"].strip(), {}).get(m["id"], 0) + 1
    out = []
    for dept, c in sorted(counts.items()):
        mid, n = max(c.items(), key=lambda kv: kv[1])
        m = by_id[mid]
        out.append({"department": dept, "employee_id": mid, "name": f"{m['first_name']} {m.get('last_name') or ''}".strip(),
                    "code": m["employee_code"], "reports_in_department": n, "own_department": (m.get("department") or "").strip(),
                    "already_head": mid in flagged})
    return {"proposals": out, "current_heads": sorted(flagged)}


class SetHeads(BaseModel):
    employee_ids: list[str]
    head: bool = True


@router.post("/set")
def set_heads(body: SetHeads, user: dict = Depends(require_permission("employees.manage"))):
    for i in body.employee_ids:
        supabase.table("hr_employee_profile").upsert(
            {"employee_id": i, "head_of_department": body.head, "updated_at": datetime.now(timezone.utc).isoformat()}, on_conflict="employee_id").execute()
    record_step("dept_head", None, "set" if body.head else "unset", user, basis={"count": len(body.employee_ids)})
    return {"updated": len(body.employee_ids), "head": body.head}
