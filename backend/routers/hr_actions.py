"""HR daily action list: the one message that says what still needs a person.

Everything else in HR runs by itself (digests, reminders, comp-off, AIP start/flag, dispute first pass).
This collects what is left, each item with the reason and a recommendation, so HR confirms instead of
hunting. It NEVER applies anything: warning letters, AIP outcomes, leave/dispute decisions and salary
holds stay one click away in the console ("prepare + one-click", the owner's choice 2026-11-26).

POST /api/hr-actions/digest?dry_run=true computes and sends nothing. Sends nothing on a day with no items.
"""
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query

import email_service
from auth import require_console
from config import IST
from database import supabase

router = APIRouter(prefix="/api/hr-actions", tags=["hr-actions"])

LEAVE_ESCALATE_DAYS = 5      # pending leave older than this is escalated to HR by name of approver
DISPUTE_ESCALATE_DAYS = 3
AIP_FLAG_MARKER = "[AUTO-FLAG]"
CONSOLE = "https://jade-hr.vercel.app"


def _name(e: dict | None) -> str:
    e = e or {}
    return f"{e.get('first_name', '')} {e.get('last_name') or ''}".strip()


def _age_days(row: dict, today: date) -> int:
    created = (row.get("created_at") or "")[:10]
    return (today - date.fromisoformat(created)).days if created else 0


def aip_recommendation(record: dict, today: date) -> dict | None:
    """What HR should do with an AIP, or None if it is still running with nothing to decide.
    Rule (doc §15): one late arrival is tolerated for the whole plan; a second is a failure.
    The system has already flagged a failure at the second late arrival ([AUTO-FLAG] in notes)."""
    if AIP_FLAG_MARKER in (record.get("notes") or ""):
        return {"action": "close_failed", "why": "second late arrival during the plan (auto-flagged); a person decides the outcome"}
    return None  # a clean plan that has ended is closed as PASSED by the daily AIP enforcement, no decision needed


def collect(today: date | None = None) -> dict:
    today = today or datetime.now(IST).date()
    items = {"leave": [], "disputes": [], "aip": [], "wfh": []}

    leave = (supabase.table("hr_leave_requests")
             .select("*, hr_employees!hr_leave_requests_employee_id_fkey(first_name,last_name,employee_code)")
             .eq("status", "pending").order("created_at").execute().data) or []
    for r in leave:
        waited = _age_days(r, today)
        past = r["end_date"] < today.isoformat()
        if waited > LEAVE_ESCALATE_DAYS or past:
            e = r.get("hr_employees") or {}
            items["leave"].append({
                "id": r["id"], "who": f"{_name(e)} ({e.get('employee_code', '')})", "dates": f"{r['start_date']} to {r['end_date']}",
                "waiting_days": waited, "dates_passed": past,
                "why": "dates already passed, still undecided" if past else f"waiting {waited} days for the approver"})

    disputes = (supabase.table("hr_attendance_disputes")
                .select("*, hr_employees!hr_attendance_disputes_employee_id_fkey(first_name,last_name,employee_code)")
                .eq("status", "pending").order("created_at").execute().data) or []
    for r in disputes:
        waited = _age_days(r, today)
        if waited > DISPUTE_ESCALATE_DAYS:
            e = r.get("hr_employees") or {}
            items["disputes"].append({"id": r["id"], "who": f"{_name(e)} ({e.get('employee_code', '')})", "date": r.get("date"),
                                      "waiting_days": waited, "why": f"waiting {waited} days"})

    aips = supabase.table("hr_aip_records").select("*, hr_employees!hr_aip_records_employee_id_fkey(first_name,last_name,employee_code)") \
        .eq("status", "active").execute().data or []
    for r in aips:
        rec = aip_recommendation(r, today)
        if rec:
            e = r.get("hr_employees") or {}
            items["aip"].append({"id": r["id"], "who": f"{_name(e)} ({e.get('employee_code', '')})", "ends": r["end_date"], **rec})

    try:
        wfh = (supabase.table("hr_wfh_requests").select("*").eq("status", "approved").execute().data) or []
        items["wfh"] = [{"id": w["id"], "why": "work from home finished, completion not confirmed"} for w in wfh
                        if w.get("work_completed") is None and w["end_date"] < today.isoformat()]
    except Exception:
        pass
    return {"date": today.isoformat(), "items": items, "total": sum(len(v) for v in items.values())}


def render(data: dict) -> str:
    it = data["items"]
    lines = [f"What needs a person on {data['date']} — everything else is running by itself.", ""]
    if it["aip"]:
        lines.append(f"AIP failures to confirm ({len(it['aip'])}) — recommendation prepared, close in Admin > AIP:")
        lines += [f"  • {x['who']}: close as FAILED — {x['why']} (plan ends {x['ends']})" for x in it["aip"]]
        lines.append("")
    if it["leave"]:
        lines.append(f"Leave stuck with an approver ({len(it['leave'])}):")
        lines += [f"  • {x['who']}: {x['dates']} — {x['why']}" for x in it["leave"]]
        lines.append("")
    if it["disputes"]:
        lines.append(f"Disputes waiting more than {DISPUTE_ESCALATE_DAYS} days ({len(it['disputes'])}):")
        lines += [f"  • {x['who']}: {x['date']} — {x['why']}" for x in it["disputes"]]
        lines.append("")
    if it["wfh"]:
        lines.append(f"Work-from-home completions to confirm ({len(it['wfh'])}).")
        lines.append("")
    lines.append(f"Open {CONSOLE}. Nothing has been approved, closed or deducted automatically.")
    return "\n".join(lines)


ESCALATION_DAYS = (5, 8, 12)   # each threshold fires once (the job runs daily), so no state is needed and nobody is nagged daily


def escalation_due(waited_days: int) -> bool:
    return waited_days in ESCALATION_DAYS


def escalate_leave(today: date, dry_run: bool) -> list[dict]:
    """Leave still undecided after 5 / 8 / 12 days goes to the APPROVER'S OWN MANAGER (HR if they have none), by name,
    with the plain consequence: it holds up the team's pay. Sends nothing else; decides nothing."""
    pending = (supabase.table("hr_leave_requests")
               .select("*, hr_employees!hr_leave_requests_employee_id_fkey(first_name,last_name,employee_code,leave_approver_id)")
               .eq("status", "pending").execute().data) or []
    due = [r for r in pending if escalation_due(_age_days(r, today)) and r["end_date"] >= today.isoformat()]
    if not due:
        return []
    ids = list({r["employee_id"] for r in due})
    profiles = {p["employee_id"]: p for p in (supabase.table("hr_employee_profile").select("employee_id,reporting_to_id")
                                              .in_("employee_id", ids).execute().data or [])}
    approver_of = {r["id"]: (profiles.get(r["employee_id"], {}).get("reporting_to_id") or (r.get("hr_employees") or {}).get("leave_approver_id")) for r in due}
    approver_ids = list({a for a in approver_of.values() if a})
    approvers = {e["id"]: e for e in (supabase.table("hr_employees").select("id,first_name,last_name,email,is_active")
                                      .in_("id", approver_ids).execute().data if approver_ids else []) or []}
    boss_profiles = {p["employee_id"]: p.get("reporting_to_id") for p in (supabase.table("hr_employee_profile").select("employee_id,reporting_to_id")
                                                                           .in_("employee_id", approver_ids).execute().data if approver_ids else []) or []}
    boss_ids = list({b for b in boss_profiles.values() if b})
    bosses = {e["id"]: e for e in (supabase.table("hr_employees").select("id,first_name,last_name,email,is_active")
                                   .in_("id", boss_ids).execute().data if boss_ids else []) or []}
    groups: dict[str, dict] = {}
    for r in due:
        approver = approvers.get(approver_of.get(r["id"]))
        boss = bosses.get(boss_profiles.get(approver["id"])) if approver else None
        target = boss if boss and boss.get("is_active") and boss.get("email") else None
        key = target["email"] if target else email_service.HR_NOTIFY_EMAIL
        g = groups.setdefault(key, {"to": _name(target) if target else "HR", "lines": []})
        e = r.get("hr_employees") or {}
        g["lines"].append(f"  • {_name(e)} ({e.get('employee_code', '')}): {r['start_date']} to {r['end_date']} — waiting {_age_days(r, today)} days "
                          f"for {_name(approver) if approver else 'an approver (none set)'}")
    out = []
    for email, g in groups.items():
        body = (f"Hi {g['to']},\n\nThese leave requests are still undecided and now hold up the team's pay cycle. "
                f"Please ask the approver to decide today, or decide them yourself in the console:\n\n" + "\n".join(g["lines"]) +
                f"\n\n{CONSOLE}\n")
        ok = None if dry_run else email_service.send_email_detailed(email, f"Leave waiting on approval: {len(g['lines'])} request(s)", body, kind="leave_escalation")[0]
        out.append({"to": email, "requests": len(g["lines"]), "sent": ok})
    return out


@router.post("/digest")
def hr_actions_digest(dry_run: bool = Query(default=False), user: dict = Depends(require_console)):
    data = collect()
    try:
        escalated = escalate_leave(datetime.now(IST).date(), dry_run)
    except Exception:   # an escalation problem must never stop the HR list going out
        escalated = []
    emailed = False
    if data["total"] and not dry_run:
        emailed, _ = email_service.send_email_detailed(
            email_service.HR_NOTIFY_EMAIL, f"HR: {data['total']} item{'s' if data['total'] != 1 else ''} need a person today",
            render(data), kind="hr_actions")
    return {**data, "dry_run": dry_run, "emailed": bool(emailed), "escalated": escalated}
