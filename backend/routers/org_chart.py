"""Organisation chart / location-wise headcount.

Computed live on every request from hr_employees + hr_employee_profile +
hr_exit_records — nothing is stored or cached here, so a change to anyone's
location, designation, reporting manager, confirmation date, resignation or
leaving date shows up on the next load with no sync step.

Status (first match wins):
  Absconded / Terminated  profile.employee_status says so
  Resigned                an exit record exists (resignation_date), or status is On Notice / Exited
  Confirmed               confirmation_date entered
  On Probation            otherwise — i.e. confirmation_date not entered

Resignation date and leaving date (last working day) are separate fields:
  resignation_date  hr_exit_records.resignation_date (set when HR initiates an exit)
  leaving_date      profile.exit_date, else profile.scheduled_exit_date

Visibility in the active view:
  leaving_date < today                 hidden (stays in the database)
  leaving_date >= today                shown until the last working day
  no leaving_date                      shown, unless already Exited/Inactive or the login is
                                       deactivated — Absconded/Terminated stay visible, with
                                       their status badge, until a leaving date is entered
"""

from datetime import date

from fastapi import APIRouter, Depends, Query

from auth import require_permission
from database import supabase

router = APIRouter(prefix="/api/org-chart", tags=["org-chart"])

PLACEHOLDER_STATUSES = {"exited", "inactive"}


def _full_name(e: dict) -> str:
    return f"{e.get('first_name', '')} {e.get('last_name') or ''}".strip()


def _norm(s: str | None) -> str:
    return " ".join((s or "").lower().split())


def derive_status(profile: dict, resignation_date: str | None) -> str:
    raw = _norm(profile.get("employee_status"))
    if raw == "absconded":
        return "Absconded"
    if raw == "terminated":
        return "Terminated"
    if resignation_date or raw in ("on notice", "exited"):
        return "Resigned"
    return "Confirmed" if profile.get("confirmation_date") else "On Probation"


def is_visible(*, leaving_date: str | None, status_raw: str, is_active: bool, derived: str, today: str) -> bool:
    if leaving_date:
        return leaving_date >= today
    if derived in ("Absconded", "Terminated"):
        return True
    return is_active and _norm(status_raw) not in PLACEHOLDER_STATUSES


@router.get("")
def org_chart(
    location: str | None = Query(default=None, description="Exact location name; omit for all locations"),
    include_left: bool = Query(default=False, description="Also return people whose leaving date has passed"),
    user: dict = Depends(require_permission("employees.view")),
):
    employees = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,designation,department,location,is_active,date_of_joining,leave_approver_id")
        .execute()
        .data
    ) or []
    profiles = {
        p["employee_id"]: p for p in (
            supabase.table("hr_employee_profile")
            .select("employee_id,reporting_to,reporting_to_id,confirmation_date,scheduled_exit_date,exit_date,employee_status")
            .execute()
            .data
        ) or []
    }
    # Latest resignation per employee (an employee can have more than one exit
    # record over time, e.g. a rejoinee).
    resignations: dict[str, str] = {}
    for r in (
        supabase.table("hr_exit_records").select("employee_id,resignation_date").execute().data or []
    ):
        if r.get("resignation_date") and r["resignation_date"] > resignations.get(r["employee_id"], ""):
            resignations[r["employee_id"]] = r["resignation_date"]

    by_id = {e["id"]: e for e in employees}
    names: dict[str, list[str]] = {}
    for e in employees:
        names.setdefault(_norm(_full_name(e)), []).append(e["id"])

    # First-name-only references ("akshay", "sagar") resolve when exactly one
    # active person has that first name.
    first_names: dict[str, list[str]] = {}
    for e in employees:
        if e["is_active"] and e.get("first_name"):
            first_names.setdefault(_norm(e["first_name"].split()[0]), []).append(e["id"])

    today = date.today().isoformat()
    rows = []
    for e in employees:
        p = profiles.get(e["id"], {})
        resignation_date = resignations.get(e["id"])
        status = derive_status(p, resignation_date)
        leaving_date = p.get("exit_date") or p.get("scheduled_exit_date")
        active_view = is_visible(
            leaving_date=leaving_date, status_raw=p.get("employee_status") or "",
            is_active=e["is_active"], derived=status, today=today,
        )

        # Reporting manager: the real employee link first, then fall back to the
        # free-text name when it matches exactly one employee.
        manager_id = p.get("reporting_to_id") or None
        manager_name = None
        if manager_id and manager_id in by_id:
            manager_name = _full_name(by_id[manager_id])
        else:
            manager_id = None
            text = (p.get("reporting_to") or "").strip()
            matches = names.get(_norm(text), []) if text else []
            if not matches and text and len(text.split()) == 1:
                matches = first_names.get(_norm(text), [])
            if len(matches) == 1 and matches[0] != e["id"]:
                manager_id, manager_name = matches[0], _full_name(by_id[matches[0]])
            elif text:
                manager_name = text  # named but not linkable — shown, but can't be placed in the tree

        rows.append({
            "employee_id": e["id"],
            "employee_code": e["employee_code"],
            "name": _full_name(e),
            "name_pending": "auto-added from biometric" in _full_name(e),
            "designation": e.get("designation") or "",
            "department": e.get("department") or "",
            "location": e.get("location") or "",
            "reporting_manager_id": manager_id,
            "reporting_manager": manager_name,
            "status": status,
            "confirmation_date": p.get("confirmation_date"),
            "resignation_date": resignation_date,
            "leaving_date": leaving_date,
            "date_of_joining": e.get("date_of_joining"),
            "active_view": active_view,
        })

    # Visible set is decided on the full roster, then narrowed by location.
    # Managers stay resolvable across locations so a Delhi person reporting to
    # a Mumbai manager still shows who they report to.
    locations = sorted({r["location"] for r in rows if r["active_view"] and r["location"]})

    result = [
        r for r in rows
        if (include_left or r["active_view"]) and (not location or r["location"] == location)
    ]
    result.sort(key=lambda r: r["name"].lower())
    shown_counts: dict[str, int] = {}
    for r in result:
        if r["active_view"]:
            shown_counts[r["status"]] = shown_counts.get(r["status"], 0) + 1

    return {
        "as_of": today,
        "locations": locations,
        "headcount": sum(1 for r in result if r["active_view"]),
        "status_counts": shown_counts,
        "employees": result,
        "data_gaps": {
            "name_pending": sum(1 for r in result if r["active_view"] and r["name_pending"]),
            "no_designation": sum(1 for r in result if r["active_view"] and not r["designation"]),
            "no_reporting_manager": sum(1 for r in result if r["active_view"] and not r["reporting_manager"]),
            "manager_not_linked": sum(
                1 for r in result if r["active_view"] and r["reporting_manager"] and not r["reporting_manager_id"]
            ),
        },
    }
