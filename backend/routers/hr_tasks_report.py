"""HR Tasks report — the shape of the team's workload, rather than the task
list itself (routers/hr_tasks.py serves that).

Answers the questions a report is actually for: what is overdue, who is
carrying what, how long things sit before they get closed, and whether the
team is keeping up. Same HR-only gate as the task list — Accounts never sees
this section (see auth.require_hr_role).
"""

from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends

from auth import require_hr_role
from database import supabase

router = APIRouter(prefix="/api/hr-tasks-report", tags=["hr-tasks"])

# Anything open past this many days is called out separately from merely
# overdue — a task nobody has touched in a month is a different problem from
# one that slipped its date last week.
STALE_OPEN_DAYS = 30


def _age_days(iso: str | None, until: date) -> int | None:
    if not iso:
        return None
    return (until - datetime.fromisoformat(iso).astimezone(timezone.utc).date()).days


@router.get("")
def hr_tasks_report(user: dict = Depends(require_hr_role)):
    tasks = (
        supabase.table("hr_tasks")
        .select("*, assignee:hr_employees!hr_tasks_assigned_to_fkey(first_name,last_name,employee_code)")
        .execute()
        .data
    ) or []
    today = date.today()

    open_tasks = [t for t in tasks if t["status"] != "done"]
    done_tasks = [t for t in tasks if t["status"] == "done"]

    overdue = [t for t in open_tasks if t.get("due_date") and t["due_date"] < today.isoformat()]
    no_due_date = [t for t in open_tasks if not t.get("due_date")]
    unassigned = [t for t in open_tasks if not t.get("assigned_to")]
    stale = [
        t for t in open_tasks
        if (_age_days(t.get("created_at"), today) or 0) >= STALE_OPEN_DAYS
    ]

    # Turnaround: how long closed tasks actually took, so "we're keeping up"
    # is a number rather than a feeling.
    turnarounds = [
        d for d in (
            (datetime.fromisoformat(t["completed_at"]).astimezone(timezone.utc).date()
             - datetime.fromisoformat(t["created_at"]).astimezone(timezone.utc).date()).days
            for t in done_tasks if t.get("completed_at") and t.get("created_at")
        )
    ]
    turnarounds.sort()

    # Per-person load — open count, how much of it is overdue, and their
    # share of everything closed so far.
    by_person: dict[str, dict] = {}
    for t in tasks:
        a = t.get("assignee")
        key = t.get("assigned_to") or "__unassigned__"
        name = f"{a['first_name']} {a.get('last_name') or ''}".strip() if a else "Unassigned"
        row = by_person.setdefault(key, {
            "name": name,
            "employee_code": a.get("employee_code") if a else None,
            "open": 0, "overdue": 0, "done": 0, "urgent_open": 0,
        })
        if t["status"] == "done":
            row["done"] += 1
        else:
            row["open"] += 1
            if t.get("due_date") and t["due_date"] < today.isoformat():
                row["overdue"] += 1
            if t.get("priority") in ("urgent", "high"):
                row["urgent_open"] += 1

    def brief(t):
        a = t.get("assignee")
        return {
            "id": t["id"],
            "title": t["title"],
            "priority": t.get("priority"),
            "due_date": t.get("due_date"),
            "assignee": f"{a['first_name']} {a.get('last_name') or ''}".strip() if a else None,
            "days_open": _age_days(t.get("created_at"), today),
            "days_overdue": (
                (today - date.fromisoformat(t["due_date"])).days if t.get("due_date") and t["due_date"] < today.isoformat() else None
            ),
        }

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "totals": {
            "open": len(open_tasks),
            "done": len(done_tasks),
            "overdue": len(overdue),
            "unassigned": len(unassigned),
            "no_due_date": len(no_due_date),
            "stale_open": len(stale),
            "completion_rate": round(len(done_tasks) / len(tasks) * 100) if tasks else 0,
        },
        "turnaround_days": {
            "median": turnarounds[len(turnarounds) // 2] if turnarounds else None,
            "longest": turnarounds[-1] if turnarounds else None,
            "closed_sample": len(turnarounds),
        },
        "by_priority": {
            p: len([t for t in open_tasks if t.get("priority") == p])
            for p in ("urgent", "high", "normal", "low")
        },
        "by_person": sorted(by_person.values(), key=lambda r: (-r["overdue"], -r["open"])),
        "overdue_tasks": sorted(
            [brief(t) for t in overdue], key=lambda r: -(r["days_overdue"] or 0)
        ),
        "stale_tasks": sorted([brief(t) for t in stale], key=lambda r: -(r["days_open"] or 0)),
        "unassigned_tasks": [brief(t) for t in unassigned],
    }
