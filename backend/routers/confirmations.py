"""Probation confirmation — the counterpart to routers/exit_procedure.py at
the other end of the employment lifecycle.

The underlying fields (hr_employee_profile.probation_completion_date /
.confirmation_date) and the Dashboard's "Probation Ending" clock already
existed, but they were spread across three places: the clock told you
someone was due, the date was set on the Employee record's Employment tab,
and the letter came from the Letters page. This gives HR one screen that
does all three.

Read-only here — writes go through the existing PUT /api/employees/{id}/
profile, which already accepts both date fields and is gated on the same
employees.manage permission, so there's no second write path to keep in
step with it.
"""

from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from auth import require_permission
from database import supabase

router = APIRouter(prefix="/api/confirmations", tags=["confirmations"])

# How far back to look for joiners who have no probation date recorded at
# all. Without a bound, the "Not set" list is just the entire roster —
# every long-tenured employee is obviously past probation and was never
# going to be confirmed retrospectively.
UNSET_LOOKBACK_DAYS = 270


@router.get("")
def list_confirmations(
    status: str = Query(default="due", description="due | confirmed | unset"),
    user: dict = Depends(require_permission("employees.manage")),
):
    """Three views of the same roster:
      due       — probation date recorded, not yet confirmed (the work queue)
      confirmed — already confirmed, most recent first
      unset     — joined within UNSET_LOOKBACK_DAYS with NO probation date on
                  file, which is the state essentially the whole roster is
                  in today; without this HR has no way to get anyone INTO
                  the due list from here.
    """
    employees = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,department,designation,location,date_of_joining,is_active")
        .eq("is_active", True)
        .execute()
        .data
    ) or []
    profiles = {
        p["employee_id"]: p for p in (
            supabase.table("hr_employee_profile")
            .select("employee_id,probation_completion_date,confirmation_date,employee_status,employee_type")
            .execute()
            .data
        ) or []
    }

    today = date.today()
    cutoff = (today - timedelta(days=UNSET_LOOKBACK_DAYS)).isoformat()
    rows = []
    for e in employees:
        p = profiles.get(e["id"]) or {}
        # Someone already on the way out isn't a confirmation candidate.
        if p.get("employee_status") in ("Exited", "On Notice"):
            continue
        probation_date = p.get("probation_completion_date")
        confirmed_on = p.get("confirmation_date")

        if status == "confirmed":
            if not confirmed_on:
                continue
        elif status == "unset":
            if probation_date or confirmed_on:
                continue
            # Only recent joiners — see UNSET_LOOKBACK_DAYS.
            if not e.get("date_of_joining") or e["date_of_joining"] < cutoff:
                continue
        else:  # due
            if not probation_date or confirmed_on:
                continue

        rows.append({
            "employee_id": e["id"],
            "employee_code": e["employee_code"],
            "name": f"{e['first_name']} {e.get('last_name') or ''}".strip(),
            "department": e.get("department"),
            "designation": e.get("designation"),
            "location": e.get("location"),
            "employee_type": p.get("employee_type"),
            "date_of_joining": e.get("date_of_joining"),
            "probation_completion_date": probation_date,
            "confirmation_date": confirmed_on,
            "days_remaining": (
                (date.fromisoformat(probation_date) - today).days if probation_date else None
            ),
        })

    if status == "confirmed":
        rows.sort(key=lambda r: r["confirmation_date"], reverse=True)
    elif status == "unset":
        rows.sort(key=lambda r: r["date_of_joining"] or "")
    else:
        rows.sort(key=lambda r: r["probation_completion_date"])
    return rows


# ---- Backfill: confirm long-tenured people who were never given a date -------
# 90 working days is ~18 weeks. The offer letter sets the real date per person, so
# this is a proposal HR reviews and applies, never something that runs on its own.
DEFAULT_PROBATION_DAYS = 126


def _backfill_candidates(probation_days: int) -> list[dict]:
    today = date.today()
    employees = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,department,designation,location,date_of_joining,is_active")
        .eq("is_active", True).execute().data
    ) or []
    profiles = {
        p["employee_id"]: p for p in (
            supabase.table("hr_employee_profile")
            .select("employee_id,probation_completion_date,confirmation_date,employee_status,employee_type")
            .execute().data
        ) or []
    }
    rows = []
    for e in employees:
        p = profiles.get(e["id"]) or {}
        if p.get("confirmation_date") or p.get("employee_status") in ("Exited", "On Notice", "Absconded", "Terminated"):
            continue
        doj = e.get("date_of_joining")
        if not doj:
            continue
        recorded = p.get("probation_completion_date")
        proposed = recorded or (date.fromisoformat(doj) + timedelta(days=probation_days)).isoformat()
        if proposed > today.isoformat():
            continue  # still genuinely on probation: belongs to the Due queue, not here
        rows.append({
            "employee_id": e["id"], "employee_code": e["employee_code"],
            "name": f"{e['first_name']} {e.get('last_name') or ''}".strip(),
            "department": e.get("department"), "designation": e.get("designation"),
            "location": e.get("location"), "employee_type": p.get("employee_type"),
            "date_of_joining": doj, "probation_completion_date": recorded,
            "proposed_confirmation_date": proposed,
            "basis": "recorded probation end" if recorded else f"joining date + {probation_days} days",
        })
    rows.sort(key=lambda r: r["date_of_joining"])
    return rows


@router.get("/backfill-preview")
def backfill_preview(
    probation_days: int = Query(default=DEFAULT_PROBATION_DAYS, ge=30, le=730),
    user: dict = Depends(require_permission("employees.manage")),
):
    rows = _backfill_candidates(probation_days)
    return {"probation_days": probation_days, "count": len(rows), "rows": rows}


class BackfillApply(BaseModel):
    employee_ids: list[str] = Field(min_length=1, max_length=500)
    probation_days: int = Field(default=DEFAULT_PROBATION_DAYS, ge=30, le=730)


@router.post("/backfill")
def backfill_apply(body: BackfillApply, user: dict = Depends(require_permission("employees.manage"))):
    """Dates are recomputed here from the same rule as the preview; the client only
    says WHO to confirm, so a tampered request cannot write arbitrary dates."""
    wanted = set(body.employee_ids)
    todo = [r for r in _backfill_candidates(body.probation_days) if r["employee_id"] in wanted]
    if not todo:
        raise HTTPException(status_code=400, detail="None of the selected people are eligible any more. Reload the preview.")
    now = datetime.now(timezone.utc).isoformat()
    for r in todo:
        upd = {"employee_id": r["employee_id"], "confirmation_date": r["proposed_confirmation_date"], "updated_at": now}
        if not r["probation_completion_date"]:
            upd["probation_completion_date"] = r["proposed_confirmation_date"]
        supabase.table("hr_employee_profile").upsert(upd, on_conflict="employee_id").execute()
    return {"confirmed": len(todo), "skipped": len(wanted) - len(todo)}
