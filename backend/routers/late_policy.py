"""Late-arrival policy endpoints. v2 = revision w.e.f. 22 September 2026;
superseded before it ever took effect by v3 (Attendance, Punctuality, Leave &
WFH Policy v2.0), ACTIVE from the pay cycle beginning 23 August 2026.

The per-day/per-month grading itself lives in payroll.py and reaches the
console through the payroll summaries (late_mark_count / late_card / red_card).
What needs its own endpoints is the QUARTER Red Card — a Red Card in every
month of a financial-year quarter, whose consequence is a Final Warning letter
plus automatic forfeiture of 2 Paid Leave days (hr_late_policy_actions).
"""

from paging import fetch_all_paged
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_console, require_permission
from config import IST
from database import supabase
from paging import ContextThreadPoolExecutor
from workflow_log import record_step
from models import AIPClose, AIPCreate
from payroll import (
    LATE_FREE_COUNT_V2,
    LATE_GRACE_MINUTES_V2,
    LATE_HALF_DAY_CUTOFF_V2,
    LATE_LOP_HALF_DAY_V2,
    LATE_LOP_QUARTER_DAY_V2,
    LATE_POLICY_V2_EFFECTIVE,
    LATE_POLICY_V3_EFFECTIVE,
    QUARTER_RED_CARD_PL_FORFEIT,
    RED_CARD_LATE_MARKS_V2,
    V3_AIP_DEFAULT_DAYS,
    V3_YELLOW_CARDS_FOR_RED,
    fy_month_labels,
    fy_quarter_for_month,
    late_policy_v2_active,
    late_policy_v3_active,
    pay_period_bounds,
    quarter_month_labels,
)
from routers.letters import _substitute
from routers.payroll import (
    _all_summaries_for_month,
    _fetch_all_compliance_profiles,
    _fetch_holidays,
)

router = APIRouter(prefix="/api/late-policy", tags=["late-policy"])

COMPANY_NAME = "JADE Lifestyles India"


@router.get("")
def late_policy(user: dict = Depends(get_current_user)):
    """The late-arrival numbers actually in force in the engine, so no screen
    or policy page has to hardcode a threshold that could drift from it."""
    return {
        "effective_from": LATE_POLICY_V2_EFFECTIVE.isoformat(),
        "in_force": late_policy_v2_active(date.today()),
        "grace_minutes": LATE_GRACE_MINUTES_V2,
        "free_late_marks": LATE_FREE_COUNT_V2,
        "quarter_day_deduction": LATE_LOP_QUARTER_DAY_V2,
        "half_day_deduction": LATE_LOP_HALF_DAY_V2,
        "half_day_from": LATE_HALF_DAY_CUTOFF_V2.strftime("%H:%M"),
        "red_card_at": RED_CARD_LATE_MARKS_V2,
        "quarter_red_card_pl_forfeit": QUARTER_RED_CARD_PL_FORFEIT,
        "v3": {
            "effective_from": LATE_POLICY_V3_EFFECTIVE.isoformat(),
            "in_force": late_policy_v3_active(date.today()),
            "yellow_cards_for_red": V3_YELLOW_CARDS_FOR_RED,
            "aip_default_days": V3_AIP_DEFAULT_DAYS,
            "note": (
                "Policy v3 (source doc 'Attendance, Punctuality, Leave & WFH Policy' v2.0) is ACTIVE from the "
                "pay cycle beginning 23 Aug 2026, superseding the v2 late-mark/Quarter Red Card mechanics above "
                "for every cycle from that date onward."
            ),
        },
    }


def _current_quarter() -> tuple[str, int]:
    today = date.today()
    return fy_quarter_for_month(today.year, today.month)


def _quarter_label(financial_year: str, quarter: int) -> str:
    labels = quarter_month_labels(financial_year, quarter)
    names = [date(y, m, 1).strftime("%b") for y, m in labels]
    return f"Q{quarter} FY {financial_year} ({names[0]}–{names[-1]})"


def _corporate_roster() -> tuple[list[dict], dict, dict]:
    """Active corporate-roster employees only — the late-coming policy has
    never applied to the factory/karigar roster (payroll.py gates the whole
    late/LOP machinery on employee_category == 'corporate')."""
    with ContextThreadPoolExecutor(max_workers=3) as pool:
        employees_future = pool.submit(
            lambda: supabase.table("hr_employees").select("*").eq("is_active", True).execute().data
        )
        profiles_future = pool.submit(_fetch_all_compliance_profiles)
        holidays_future = pool.submit(_fetch_holidays)
        employees = employees_future.result()
        profiles_by_employee = profiles_future.result()
        holidays = holidays_future.result()
    corporate = [
        e for e in employees
        if {**e, **profiles_by_employee.get(e["id"], {})}.get("employee_category") == "corporate"
    ]
    return corporate, profiles_by_employee, holidays


def _existing_actions(financial_year: str, quarter: int) -> dict[str, dict]:
    resp = (
        supabase.table("hr_late_policy_actions")
        .select("*")
        .eq("financial_year", financial_year)
        .eq("quarter", quarter)
        .execute()
    )
    return {r["employee_id"]: r for r in resp.data}


def _quarter_status(financial_year: str, quarter: int) -> list[dict]:
    """Per-employee Red Card status across the three pay periods in the
    quarter. Months that closed BEFORE the policy took effect are reported
    with `in_policy: false` and can never contribute a Red Card to a Quarter
    Red Card — the revision is not applied backwards (a pre-revision month
    used a 5-late Red Card threshold, so counting it here would mix two
    different policies into one penalty)."""
    labels = quarter_month_labels(financial_year, quarter)
    employees, profiles_by_employee, holidays = _corporate_roster()
    if not employees:
        return []

    # The three months are independent full-roster computes; run them
    # concurrently so this stays close to one month's wall time (each one
    # already parallelizes its own bulk fetches internally).
    with ContextThreadPoolExecutor(max_workers=3) as pool:
        futures = {
            (y, m): pool.submit(
                _all_summaries_for_month, employees, profiles_by_employee, holidays, y, m
            )
            for (y, m) in labels
        }
        by_month = {label: {s["employee_id"]: s for s in f.result()} for label, f in futures.items()}

    today = date.today()
    actions = _existing_actions(financial_year, quarter)
    rows = []
    for employee in employees:
        months = []
        for (y, m) in labels:
            _, period_end = pay_period_bounds(y, m)
            summary = by_month[(y, m)].get(employee["id"], {})
            months.append({
                "year": y,
                "month": m,
                "label": f"{y}-{m:02d}",
                "late_mark_count": summary.get("late_mark_count", 0),
                "red_card": bool(summary.get("red_card")),
                "late_card": summary.get("late_card", "none"),
                # A period still running can still change; a period that ended
                # before the revision is out of scope for the quarter penalty.
                # A period governed by v3 is ALSO out of scope — v3's doc has
                # no Quarter Red Card concept at all (its Red Card leads to an
                # AIP instead, see /v3/aip below), so it must never complete
                # one. ACTIVE from the pay cycle beginning 23 Aug 2026
                # (LATE_POLICY_V3_EFFECTIVE) — no cycle from that date onward
                # can ever complete a Quarter Red Card.
                "in_policy": late_policy_v2_active(period_end) and not late_policy_v3_active(period_end),
                "complete": period_end <= today,
            })
        in_scope = [m for m in months if m["in_policy"]]
        qualifies = len(in_scope) == len(labels) and all(m["red_card"] for m in in_scope)
        rows.append({
            "employee_id": employee["id"],
            "employee_code": employee["employee_code"],
            "name": f"{employee['first_name']} {employee.get('last_name') or ''}".strip(),
            "department": employee.get("department"),
            "designation": employee.get("designation"),
            "months": months,
            "red_card_months": sum(1 for m in months if m["red_card"] and m["in_policy"]),
            # Includes pre-revision months, which can never contribute to the
            # penalty but must still be visible to HR — otherwise a quarter
            # that straddles the effective date renders as an empty table.
            "red_card_months_all": sum(1 for m in months if m["red_card"]),
            "quarter_red_card": qualifies,
            "quarter_complete": all(m["complete"] for m in months),
            "action": actions.get(employee["id"]),
        })
    return rows


@router.get("/quarter-red-cards")
def quarter_red_cards(
    financial_year: str | None = Query(default=None, description="e.g. 2026-27; defaults to the current quarter"),
    quarter: int | None = Query(default=None, ge=1, le=4),
    only_qualifying: bool = Query(default=False),
    user: dict = Depends(require_permission("attendance.view", "payroll.view")),
):
    """Read-only view of who is heading for (or has earned) a Quarter Red Card.
    Applies nothing — see POST /run."""
    if financial_year is None or quarter is None:
        financial_year, quarter = _current_quarter()
    rows = _quarter_status(financial_year, quarter)
    if only_qualifying:
        rows = [r for r in rows if r["quarter_red_card"]]
    return {
        "financial_year": financial_year,
        "quarter": quarter,
        "quarter_label": _quarter_label(financial_year, quarter),
        "months": [f"{y}-{m:02d}" for y, m in quarter_month_labels(financial_year, quarter)],
        "pl_forfeit": QUARTER_RED_CARD_PL_FORFEIT,
        "employees": rows,
    }


def _late_mark_summary_html(row: dict) -> str:
    parts = [
        f"{date(m['year'], m['month'], 1).strftime('%B %Y')}: {m['late_mark_count']} late markings"
        for m in row["months"] if m["in_policy"]
    ]
    # A <ul> (not <br>-joined text) since the final_warning template places
    # {{late_mark_summary}} as its own block — sql/070.
    return "<ul>" + "".join(f"<li>{p}</li>" for p in parts) + "</ul>"


def _forfeit_paid_leave(row: dict, financial_year: str, quarter: int, entry_date: date, user: dict) -> dict:
    """Post the −2 PL debit and the Final Warning letter for one employee, and
    record the action. The hr_late_policy_actions UNIQUE (employee, FY,
    quarter) row is claimed FIRST and acts as the idempotency lock, so a
    re-run — or two cron invocations racing — can never double-debit a leave
    balance. If either write behind it fails, the claim is released again so
    the next run retries cleanly rather than leaving a recorded penalty that
    was never actually applied."""
    late_marks = {m["label"]: m["late_mark_count"] for m in row["months"] if m["in_policy"]}
    try:
        claim = supabase.table("hr_late_policy_actions").insert({
            "employee_id": row["employee_id"],
            "financial_year": financial_year,
            "quarter": quarter,
            "late_marks": late_marks,
            "pl_forfeited": QUARTER_RED_CARD_PL_FORFEIT,
            "created_by": user["id"],
        }).execute()
    except Exception:
        # Unique violation: this quarter's penalty is already on the books.
        return {"employee_id": row["employee_id"], "status": "already_applied"}
    action = claim.data[0]

    try:
        quarter_label = _quarter_label(financial_year, quarter)
        ledger = supabase.table("hr_leave_ledger").insert({
            "employee_id": row["employee_id"],
            "leave_type": "paid",
            "transaction_type": "debit",
            "amount": -QUARTER_RED_CARD_PL_FORFEIT,
            "remarks": f"Quarter Red Card — {quarter_label}: {int(QUARTER_RED_CARD_PL_FORFEIT)} PL forfeited "
                       "per the late-arrival policy w.e.f. 22 Sept 2026",
            "entry_date": entry_date.isoformat(),
            "created_by": user["id"],
        }).execute()

        template = (
            supabase.table("hr_letter_templates").select("body").eq("letter_type", "final_warning").execute()
        )
        letter_id = None
        if template.data:
            field_values = {
                "employee_name": row["name"],
                "employee_code": row["employee_code"],
                "designation": row.get("designation") or "",
                "department": row.get("department") or "",
                "quarter_label": quarter_label,
                "late_mark_summary": _late_mark_summary_html(row),
                "pl_forfeited": str(int(QUARTER_RED_CARD_PL_FORFEIT)),
                "action_date": entry_date.strftime("%d %B %Y"),
                "letter_date": entry_date.strftime("%d %B %Y"),
                "signatory_name": f"{user.get('first_name', '')} {user.get('last_name', '') or ''}".strip(),
                "signatory_title": "Head - HR",
                "company_name": COMPANY_NAME,
            }
            letter = supabase.table("hr_generated_letters").insert({
                "letter_type": "final_warning",
                "title": "Final Warning Letter: Late Arrival",
                "employee_id": row["employee_id"],
                "rendered_body": _substitute(template.data[0]["body"], field_values, frozenset({"late_mark_summary"})),
                "field_values": field_values,
                "generated_by": user["id"],
            }).execute()
            letter_id = letter.data[0]["id"] if letter.data else None

        updated = supabase.table("hr_late_policy_actions").update({
            "ledger_entry_id": ledger.data[0]["id"] if ledger.data else None,
            "letter_id": letter_id,
        }).eq("id", action["id"]).execute()
        applied = updated.data[0] if updated.data else action
    except Exception:
        supabase.table("hr_late_policy_actions").delete().eq("id", action["id"]).execute()
        raise

    record_step(
        "quarter_red_card", action["id"], "applied", user, employee_id=row["employee_id"],
        basis={"quarter": _quarter_label(financial_year, quarter), "pl_forfeited": QUARTER_RED_CARD_PL_FORFEIT,
               "late_marks": late_marks, "letter_issued": bool(letter_id)},
    )

    return {"employee_id": row["employee_id"], "status": "applied", "action": applied}


@router.post("/quarter-red-cards/run")
def run_quarter_red_cards(
    financial_year: str | None = Query(default=None),
    quarter: int | None = Query(default=None, ge=1, le=4),
    dry_run: bool = Query(default=False),
    allow_incomplete_quarter: bool = Query(
        default=False,
        description="Apply before all three pay periods have closed (normally refused)",
    ),
    user: dict = Depends(require_permission("leave.manage")),
):
    """Issue the Quarter Red Card consequences: Final Warning letter + the
    automatic 2-PL forfeiture, for everyone who earned a Red Card in all three
    months of the quarter. Idempotent — safe to re-run, and safe to run from
    cron the day after a quarter closes."""
    if financial_year is None or quarter is None:
        financial_year, quarter = _current_quarter()
    rows = _quarter_status(financial_year, quarter)
    qualifying = [r for r in rows if r["quarter_red_card"]]
    incomplete = [r for r in qualifying if not r["quarter_complete"]]
    if incomplete and not allow_incomplete_quarter and not dry_run:
        raise HTTPException(
            status_code=400,
            detail=f"{_quarter_label(financial_year, quarter)} has not finished yet — a still-running pay period "
                   "can still change. Re-run after it closes, or pass allow_incomplete_quarter=true.",
        )

    _, entry_date = pay_period_bounds(*quarter_month_labels(financial_year, quarter)[-1])
    results = []
    for row in qualifying:
        if row["action"]:
            results.append({"employee_id": row["employee_id"], "status": "already_applied"})
        elif dry_run:
            results.append({"employee_id": row["employee_id"], "status": "would_apply"})
        else:
            results.append(_forfeit_paid_leave(row, financial_year, quarter, entry_date, user))

    return {
        "financial_year": financial_year,
        "quarter": quarter,
        "quarter_label": _quarter_label(financial_year, quarter),
        "dry_run": dry_run,
        "pl_forfeit_each": QUARTER_RED_CARD_PL_FORFEIT,
        "qualifying_count": len(qualifying),
        "applied": sum(1 for r in results if r["status"] == "applied"),
        "results": results,
        "employees": [
            {k: v for k, v in r.items() if k != "action"} | {"already_applied": bool(r["action"])}
            for r in qualifying
        ],
        "generated_at": datetime.now().isoformat(),
    }


# ─────────────────────────────────────────────────────────────────────────
# Policy v3 — Attendance Improvement Plan (§15), late-working safety (§26),
# and the Punctuality Calculator (§16). All dormant/inert with the rest of
# v3 in the sense that they don't touch payroll math; AIP/safety are pure
# HR record-keeping and reporting, safe to expose regardless of
# LATE_POLICY_V3_EFFECTIVE.
# ─────────────────────────────────────────────────────────────────────────


@router.get("/v3/aip")
def list_aip(
    employee_id: str | None = Query(default=None),
    status: str | None = Query(default=None, description="active | passed | failed"),
    user: dict = Depends(require_permission("leave.manage")),
):
    q = (
        supabase.table("hr_aip_records")
        .select("*, hr_employees!hr_aip_records_employee_id_fkey(first_name,last_name,employee_code,location,designation)")
        .order("start_date", desc=True)
    )
    if employee_id:
        q = q.eq("employee_id", employee_id)
    if status:
        q = q.eq("status", status)
    return q.execute().data


@router.get("/v3/aip/mine")
def my_aip(user: dict = Depends(get_current_user)):
    """The calling employee's own current/most-recent AIP record, so the
    console has something to show them beyond the vague Red Card banner text
    (doc §15 says the employee must know they're on one, since only 1 late
    arrival is tolerated for its duration — there was previously no way for
    them to see the real start/end dates or how long is left). Returns null
    if they've never had one. No permission gate beyond being logged in —
    this is a person's own record, same visibility level as their own
    payslip."""
    resp = (
        supabase.table("hr_aip_records")
        .select("*")
        .eq("employee_id", user["id"])
        .order("start_date", desc=True)
        .limit(1)
        .execute()
    )
    return resp.data[0] if resp.data else None


@router.post("/v3/aip")
def start_aip(body: AIPCreate, user: dict = Depends(require_permission("leave.manage"))):
    """Places an employee on an Attendance Improvement Plan (doc §15 — HR
    picks 30 or 60 days; only 1 late arrival tolerated for the duration).
    Does not touch payroll or terminate anyone — AIP failure is surfaced via
    GET /v3/aip for HR to act on through the normal disciplinary process."""
    if body.duration_days not in (30, 60):
        raise HTTPException(status_code=400, detail="duration_days must be 30 or 60")
    existing = (
        supabase.table("hr_aip_records")
        .select("id")
        .eq("employee_id", body.employee_id)
        .eq("status", "active")
        .execute()
    )
    if existing.data:
        raise HTTPException(status_code=409, detail="This employee already has an active AIP")
    row = {
        "employee_id": body.employee_id,
        "duration_days": body.duration_days,
        "start_date": body.start_date.isoformat(),
        "end_date": (body.start_date + timedelta(days=body.duration_days)).isoformat(),
        "notes": body.notes,
        "created_by": user["id"],
    }
    inserted = supabase.table("hr_aip_records").insert(row).execute()
    record_step("aip", inserted.data[0].get("id"), "started", user, employee_id=body.employee_id,
                basis={"duration_days": body.duration_days, "start_date": row["start_date"]}, note=body.notes or "")
    return inserted.data[0]


@router.post("/v3/aip/{aip_id}/close")
def close_aip(aip_id: str, body: AIPClose, user: dict = Depends(require_permission("leave.manage"))):
    if body.status not in ("passed", "failed"):
        raise HTTPException(status_code=400, detail="status must be 'passed' or 'failed'")
    updated = (
        supabase.table("hr_aip_records")
        .update({"status": body.status, "notes": body.notes, "closed_by": user["id"],
                 "closed_at": datetime.now().isoformat()})
        .eq("id", aip_id).eq("status", "active")
        .execute()
    )
    if not updated.data:
        raise HTTPException(status_code=404, detail="No active AIP with that id")
    record_step("aip", aip_id, f"closed_{body.status}", user, employee_id=updated.data[0].get("employee_id"),
                note=body.notes or "")
    return updated.data[0]


AIP_AUTO_FLAG_MARKER = "[AUTO-FLAG]"


def _cycle_label_for(d: date) -> tuple[int, int]:
    """The (year, month) pay-period label whose 23rd-22nd window contains d."""
    y, m = (d.year + 1, 1) if (d.month == 12 and d.day >= 23) else (d.year, d.month + (1 if d.day >= 23 else 0))
    return y, m


@router.post("/v3/aip/enforce")
def enforce_aip(
    dry_run: bool = Query(default=False),
    user: dict = Depends(require_console),
):
    """Switches the AIP (doc §15) on. Run daily. Two rules:

    1. START — a corporate employee who has a Red Card (7 Yellow Cards) in the
       current pay cycle and no AIP started since that cycle began is put on a
       30-day AIP starting today.
    2. FLAG — on an active AIP only ONE late arrival (any Yellow Card day) is
       permitted for the whole plan; a second one flags the AIP for HR
       (note marker + workflow-log step + email to HR). The AIP is NOT closed
       and pay is NOT touched: HR still closes it passed/failed and takes the
       disciplinary step. Flagged once only (marker in notes).
    """
    from email_service import HR_NOTIFY_EMAIL, send_email

    today = datetime.now(IST).date()
    cur_label = _cycle_label_for(today)
    cycle_start, _ = pay_period_bounds(*cur_label)

    corporate, profiles_by_employee, holidays = _corporate_roster()
    corp_by_id = {e["id"]: e for e in corporate}

    active = [r for r in supabase.table("hr_aip_records").select("*").eq("status", "active").execute().data
              if r["employee_id"] in corp_by_id]
    since_cycle = supabase.table("hr_aip_records").select("employee_id").gte("start_date", cycle_start.isoformat()).execute().data
    has_aip_this_cycle = {r["employee_id"] for r in since_cycle}
    active_ids = {r["employee_id"] for r in active}

    # Pay-cycle labels needed: the current one, plus any back to the earliest active AIP start.
    labels = {cur_label}
    for r in active:
        labels.add(_cycle_label_for(date.fromisoformat(r["start_date"])))
    labels = sorted(labels)
    with ContextThreadPoolExecutor(max_workers=min(len(labels), 4)) as pool:
        futures = {
            lab: pool.submit(_all_summaries_for_month, corporate, profiles_by_employee, holidays, lab[0], lab[1], True)
            for lab in labels
        }
        by_label = {lab: {s["employee_id"]: s for s in f.result()} for lab, f in futures.items()}

    def late_dates(employee_id: str, start: date, end: date) -> list[str]:
        out = []
        for summary_map in by_label.values():
            for row in (summary_map.get(employee_id) or {}).get("daily", []):
                if row.get("late_band_v3") and start.isoformat() <= row["date"] <= end.isoformat():
                    out.append(row["date"])
        return sorted(set(out))

    started, flagged = [], []

    # Rule 1 — Red Card this cycle => start a 30-day AIP.
    for emp_id, s in by_label[cur_label].items():
        v3 = s.get("late_policy_v3") or {}
        if not v3.get("red_card") or emp_id in active_ids or emp_id in has_aip_this_cycle or emp_id not in corp_by_id:
            continue
        e = corp_by_id[emp_id]
        name = f"{e['first_name']} {e.get('last_name') or ''}".strip()
        entry = {"employee_id": emp_id, "employee_code": e["employee_code"], "name": name,
                 "yellow_cards": v3.get("yellow_card_count")}
        if not dry_run:
            end = today + timedelta(days=V3_AIP_DEFAULT_DAYS)
            row = {
                "employee_id": emp_id, "duration_days": V3_AIP_DEFAULT_DAYS,
                "start_date": today.isoformat(), "end_date": end.isoformat(),
                "notes": f"Auto-started: Red Card ({v3.get('yellow_card_count')} Yellow Cards) in the cycle from {cycle_start.isoformat()}.",
                "created_by": None,
            }
            inserted = supabase.table("hr_aip_records").insert(row).execute()
            record_step("aip", inserted.data[0].get("id"), "auto_started", None, employee_id=emp_id,
                        basis={"yellow_cards": v3.get("yellow_card_count"), "cycle_start": cycle_start.isoformat()})
            entry["aip_id"] = inserted.data[0].get("id")
        started.append(entry)

    # Rule 2 — second late arrival while on an active AIP => flag for HR.
    for r in active:
        if AIP_AUTO_FLAG_MARKER in (r.get("notes") or ""):
            continue
        start = date.fromisoformat(r["start_date"])
        end = min(today, date.fromisoformat(r["end_date"]))
        dates = late_dates(r["employee_id"], start, end)
        if len(dates) < 2:
            continue
        e = corp_by_id[r["employee_id"]]
        name = f"{e['first_name']} {e.get('last_name') or ''}".strip()
        entry = {"aip_id": r["id"], "employee_code": e["employee_code"], "name": name, "late_dates": dates,
                 "aip_end_date": r["end_date"]}
        if not dry_run:
            note = f"{(r.get('notes') or '').strip()} {AIP_AUTO_FLAG_MARKER} {len(dates)} late arrivals during AIP ({', '.join(dates)}); only 1 permitted — review for failure.".strip()
            supabase.table("hr_aip_records").update({"notes": note}).eq("id", r["id"]).execute()
            record_step("aip", r["id"], "auto_flagged_failure", None, employee_id=r["employee_id"],
                        basis={"late_dates": dates}, note="Second late arrival during AIP")
        flagged.append(entry)

    if started and not dry_run:
        fresh = [r for r in supabase.table("hr_aip_records").select("*").in_("id", [x["aip_id"] for x in started if x.get("aip_id")]).execute().data]
        try:
            send_aip_notices(fresh)
        except Exception:
            pass  # HR still gets the run summary below; /v3/aip/notify can be re-run
    emailed = False
    if (started or flagged) and not dry_run:
        lines = [f"AIP update for {today.isoformat()}:", ""]
        if started:
            lines.append(f"Put on a 30-day AIP (Red Card this cycle) — {len(started)}:")
            lines += [f"  • {x['name']} ({x['employee_code']}) — {x['yellow_cards']} Yellow Cards" for x in started]
            lines.append("")
        if flagged:
            lines.append(f"Second late arrival while on an AIP — review for failure — {len(flagged)}:")
            lines += [f"  • {x['name']} ({x['employee_code']}) — late on {', '.join(x['late_dates'])}" for x in flagged]
            lines.append("")
        lines.append("Open Admin > AIP to close a plan as passed/failed. Nothing has been deducted or actioned automatically.")
        try:
            emailed = bool(send_email(HR_NOTIFY_EMAIL, f"AIP: {len(started)} started, {len(flagged)} flagged", "\n".join(lines), kind="aip"))
        except Exception:
            emailed = False
    return {"date": today.isoformat(), "dry_run": dry_run, "cycle_start": cycle_start.isoformat(),
            "started": started, "flagged": flagged, "emailed": emailed}


AIP_NOTIFIED_MARKER = "[NOTIFIED]"

AIP_RULES_TEXT = """THE AIP RULES
 - An AIP runs for 30 or 60 days, set by HR. Yours is {days} days: {start} to {end}.
 - Only ONE late arrival is permitted during the entire plan. Any arrival after your shift start counts, including a short one.
 - A second late arrival is a failure of the AIP and may lead to disciplinary action.
 - The plan stays in effect across pay cycles until HR closes it as passed or failed, even in a cycle where you do not earn a new Red Card.
 - A late arrival costs pay as set out in the Attendance Policy (v3): 0.25 or 0.5 day for the later bands, after the free allowances.
 - A Red Card in every month of a quarter is a Quarter Red Card: a Final Warning letter and 2 Paid Leave days forfeited. A continuing pattern leads to a warning letter and is taken into account at your appraisal.
 - While you hold a Red Card in a cycle, new Paid Leave and Comp-Off requests cannot be self-submitted for the rest of that cycle. HR can still file for a documented emergency.
 - If a punch is wrong or missing, raise an attendance dispute within 7 days with a clear reason. Biometric punches are the only record used.
 - Full policy: Policy page in the HR console. Questions: HR."""


def _aip_mail(name: str, rec: dict, cards) -> tuple[str, str]:
    body = (
        f"Hi {name.split(' ')[0] or 'there'},\n\n"
        f"You have been placed on an Attendance Improvement Plan (AIP) because you received a Red Card"
        f"{f' ({cards} Yellow Cards in one pay cycle)' if cards else ''}. A Red Card is 7 Yellow Cards in a pay cycle (23rd to 22nd).\n\n"
        + AIP_RULES_TEXT.format(days=rec["duration_days"], start=rec["start_date"], end=rec["end_date"])
        + "\n\nYou can see your plan on your dashboard in the HR console.\n\nHR, JADE Lifestyles India"
    )
    return "You have been placed on an Attendance Improvement Plan", body


def send_aip_notices(records: list[dict], dry_run: bool = False, summaries: bool = True) -> dict:
    """Mails each employee on a new AIP the plan and its rules, their reporting manager(s) a heads-up
    listing their reportees, and Nimit (HR) one full summary. Each AIP is marked [NOTIFIED] in its notes
    once the employee's mail has gone, so a re-run never sends twice."""
    import email_service
    from routers.payroll import _reporting_manager_emails

    ids = list({r["employee_id"] for r in records})
    emps = {e["id"]: e for e in supabase.table("hr_employees").select("id,first_name,last_name,email,employee_code").in_("id", ids).execute().data} if ids else {}
    managers = _reporting_manager_emails(set(ids))
    sent, failed, no_email = [], [], []
    by_manager: dict[str, list[str]] = {}
    lines_hr = []
    for r in records:
        e = emps.get(r["employee_id"]) or {}
        name = f"{e.get('first_name', '')} {e.get('last_name') or ''}".strip()
        label = f"{name} ({e.get('employee_code', '')})"
        mgrs = managers.get(r["employee_id"], [])
        lines_hr.append(f"  • {label}: {r['start_date']} to {r['end_date']}" + ("" if mgrs else "  [no reporting manager on file]"))
        for m in mgrs:
            by_manager.setdefault(m, []).append(label)
        if AIP_NOTIFIED_MARKER in (r.get("notes") or ""):
            continue
        if not e.get("email"):
            no_email.append(label)
            continue
        subject, body = _aip_mail(name, r, None)
        if dry_run:
            sent.append(label)
            continue
        ok, err = email_service.send_email_detailed(e["email"], subject, body, kind="aip_notice", cc=mgrs)
        if ok:
            sent.append(label)
            supabase.table("hr_aip_records").update({"notes": f"{(r.get('notes') or '').strip()} {AIP_NOTIFIED_MARKER}".strip()}).eq("id", r["id"]).execute()
        else:
            failed.append((label, err))
    mgr_sent = 0
    if not dry_run and summaries and (sent or records):
        for m, people in by_manager.items():
            ok, _ = email_service.send_email_detailed(
                m, f"{len(people)} of your team placed on an Attendance Improvement Plan",
                "The following people who report to you have been placed on a 30-day Attendance Improvement Plan "
                "after a Red Card. Only one late arrival is permitted for the whole plan.\n\n"
                + "\n".join(f"  • {p}" for p in people)
                + "\n\nEach person has been mailed the plan and its rules. Please support them in arriving on time.", kind="aip_notice_manager")
            mgr_sent += bool(ok)
        email_service.send_email_detailed(
            email_service.HR_NOTIFY_EMAIL, f"AIP started for {len(records)} people", 
            f"{len(records)} Attendance Improvement Plans are active from this run.\n\n" + "\n".join(lines_hr)
            + "\n\nEach person above (except anyone with no email on file) has been mailed the plan and its rules, with their reporting manager copied.\n\n"
            + AIP_RULES_TEXT.format(days=30, start="start", end="end"), kind="aip_notice_hr")
    return {"employee_mails": len(sent), "failed": failed, "no_email": no_email, "manager_mails": mgr_sent, "dry_run": dry_run}


@router.post("/v3/aip/notify")
def notify_aip(
    dry_run: bool = Query(default=True),
    batch: int = Query(default=10, ge=1, le=50, description="employee mails per call (a serverless call times out near 20)"),
    summary: bool = Query(default=False, description="send the reporting-manager and HR summary mails (once, after all employees are done)"),
    user: dict = Depends(require_console),
):
    """Mails everyone on a still-active AIP who has not yet been told (employee, their reporting manager
    and a summary to HR). Dry run by default."""
    active = supabase.table("hr_aip_records").select("*").eq("status", "active").execute().data
    pending = [r for r in active if AIP_NOTIFIED_MARKER not in (r.get("notes") or "")]
    if summary:
        # Managers + HR summary over every AIP already mailed; no employee mails here.
        done = [r for r in active if AIP_NOTIFIED_MARKER in (r.get("notes") or "") and "25 Nov 2026" in (r.get("notes") or "")]
        return {"active": len(active), "summary_for": len(done), **send_aip_notices(done, dry_run, summaries=True)}
    return {"active": len(active), "remaining_before": len(pending), **send_aip_notices(pending[:batch], dry_run, summaries=False)}


@router.get("/v3/late-night-safety")
def late_night_safety(
    for_date: date = Query(alias="date", default_factory=date.today),
    cutoff_hour: int = Query(default=22, ge=0, le=23),
    # Restricted to a dedicated permission (see sql/036, sql/037) — the whole
    # HR team has it by default, but it's still NOT the general
    # 'attendance.view'/'payroll.view' the Quarter Red Card list above still
    # uses. This report lists specific women employees' actual movements.
    user: dict = Depends(require_permission("attendance.restricted_reports")),
):
    """Doc §26 — women employees whose last punch on `for_date` is after
    `cutoff_hour` (default 10 PM), so HR can arrange safe transport. A
    reporting list only; it does not book anything.

    `gender` lives on hr_employee_profile, not hr_employees — filter there
    first, then pull the matching active employee rows."""
    female_ids = {
        r["employee_id"]
        for r in supabase.table("hr_employee_profile").select("employee_id,gender").ilike("gender", "female").execute().data
    }
    if not female_ids:
        return {"date": for_date.isoformat(), "cutoff_hour": cutoff_hour, "employees": []}
    employees = [
        e for e in supabase.table("hr_employees").select("id,employee_code,first_name,last_name,location")
        .eq("is_active", True).execute().data
        if e["id"] in female_ids
    ]
    if not employees:
        return {"date": for_date.isoformat(), "cutoff_hour": cutoff_hour, "employees": []}
    codes = [e["employee_code"] for e in employees]
    from_dt = datetime.combine(for_date, datetime.min.time()).isoformat()
    to_dt = datetime.combine(for_date + timedelta(days=1), datetime.min.time()).isoformat()
    punches = (
        supabase.table("hr_biometric_punches")
        .select("employee_code,punch_time")
        .in_("employee_code", codes)
        .gte("punch_time", from_dt)
        .lt("punch_time", to_dt)
        .execute()
        .data
    )
    last_punch: dict[str, datetime] = {}
    for r in punches:
        t = datetime.fromisoformat(r["punch_time"])
        if r["employee_code"] not in last_punch or t > last_punch[r["employee_code"]]:
            last_punch[r["employee_code"]] = t
    flagged = []
    for e in employees:
        last = last_punch.get(e["employee_code"])
        if last and last.astimezone(IST).hour >= cutoff_hour:
            flagged.append({
                "employee_id": e["id"],
                "employee_code": e["employee_code"],
                "name": f"{e['first_name']} {e.get('last_name') or ''}".strip(),
                "location": e.get("location"),
                "last_out": last.isoformat(),
            })
    return {"date": for_date.isoformat(), "cutoff_hour": cutoff_hour, "employees": flagged}


def _punctuality_accumulate(totals: dict, s: dict) -> None:
    totals["present_days"] += s.get("present_days", 0)
    totals["on_time_days"] += s.get("on_time_days", 0)
    if s.get("late_card") == "yellow":
        totals["yellow_card_months"] += 1
    if s.get("late_card") == "red":
        totals["red_card_months"] += 1
    v3 = s.get("late_policy_v3")
    if v3:
        for k in ("daily_tolerance_count", "extended_buffer_count", "level1_count", "level2_count", "level3_count"):
            totals[k] += v3.get(k, 0)
    for row in s.get("daily", []):
        if row.get("status") == "present" and row.get("first_in"):
            t = datetime.fromisoformat(row["first_in"]).astimezone(IST)
            totals["arrival_minutes_sum"] += t.hour * 60 + t.minute
            totals["arrival_count"] += 1


def _punctuality_finalize(totals: dict) -> dict:
    on_time_pct = round(100 * totals["on_time_days"] / totals["present_days"], 1) if totals["present_days"] else None
    avg_minutes = totals["arrival_minutes_sum"] / totals["arrival_count"] if totals["arrival_count"] else None
    avg_time = f"{int(avg_minutes // 60):02d}:{int(avg_minutes % 60):02d}" if avg_minutes is not None else None
    return {**totals, "on_time_pct": on_time_pct, "average_reporting_time": avg_time}


@router.get("/v3/punctuality")
def punctuality_calculator(
    employee_id: str | None = Query(default=None),
    scope: str = Query(default="month", pattern="^(month|quarter|year)$"),
    year: int = Query(default_factory=lambda: date.today().year),
    month: int = Query(default_factory=lambda: date.today().month, ge=1, le=12),
    financial_year: str | None = Query(default=None, description="required for scope=year, e.g. 2026-27"),
    # Restricted to a dedicated permission (see sql/036, sql/037) — the whole
    # HR team has it by default, but it's still NOT the general
    # 'attendance.view'/'payroll.view' that gate the rest of this router.
    user: dict = Depends(require_permission("attendance.restricted_reports")),
):
    """Doc §16 Punctuality Calculator — on-time %, Level 1/2/3 counts,
    Yellow/Red Card months and average reporting time, for one employee
    (or the whole corporate roster if employee_id is omitted) over a
    month/quarter/FY-year. Reuses the same summary computation the payslip
    engine uses — no separate/duplicated attendance logic."""
    if scope == "month":
        labels = [(year, month)]
    elif scope == "quarter":
        fy, quarter = fy_quarter_for_month(year, month)
        labels = quarter_month_labels(fy, quarter)
    else:
        if not financial_year:
            raise HTTPException(status_code=400, detail="financial_year is required for scope=year")
        labels = fy_month_labels(financial_year)

    with ContextThreadPoolExecutor(max_workers=3) as pool:
        employees_future = pool.submit(
            lambda: supabase.table("hr_employees").select("*").eq("is_active", True).execute().data
        )
        profiles_future = pool.submit(_fetch_all_compliance_profiles)
        holidays_future = pool.submit(_fetch_holidays)
        employees = employees_future.result()
        profiles_by_employee = profiles_future.result()
        holidays = holidays_future.result()

    corporate = [
        e for e in employees
        if {**e, **profiles_by_employee.get(e["id"], {})}.get("employee_category") == "corporate"
        and (employee_id is None or e["id"] == employee_id)
    ]

    # Doc §16 requires "AIP instances" as one of the calculator's fields —
    # AIP records live in their own table (hr_aip_records), not the
    # per-period payroll summaries _punctuality_accumulate otherwise draws
    # from, so this needs its own scoped query: every AIP whose start_date
    # falls within the scope's period range counts once for that employee.
    scope_start, _ = pay_period_bounds(*labels[0])
    _, scope_end = pay_period_bounds(*labels[-1])
    aip_counts: dict[str, int] = {}
    if corporate:
        # No employee_id IN (...): a roster-sized URL is rejected by the DB proxy.
        corporate_ids = {e["id"] for e in corporate}
        aip_rows = fetch_all_paged(
            "hr_aip_records", "employee_id", ("id",),
            lambda q: q.gte("start_date", scope_start.isoformat()).lte("start_date", scope_end.isoformat()),
        )
        for r in aip_rows:
            if r["employee_id"] in corporate_ids:
                aip_counts[r["employee_id"]] = aip_counts.get(r["employee_id"], 0) + 1

    # One bulk summary compute PER PERIOD (all employees at once), run
    # concurrently — mirrors _quarter_status. The previous version called
    # _all_summaries_for_month once per EMPLOYEE per period (each one its own
    # full bulk fetch of punches/overrides/leaves for a 1-employee "roster"),
    # which is O(employees x periods) round trips and timed out in prod for
    # scope=month over the full corporate roster. This is O(periods).
    with ContextThreadPoolExecutor(max_workers=min(len(labels), 6) or 1) as pool:
        futures = {
            (y, m): pool.submit(_all_summaries_for_month, corporate, profiles_by_employee, holidays, y, m, True)
            for (y, m) in labels
        }
        by_month = {label: {s["employee_id"]: s for s in f.result()} for label, f in futures.items()}

    rows = []
    for e in corporate:
        totals = {
            "on_time_days": 0, "daily_tolerance_count": 0, "extended_buffer_count": 0,
            "level1_count": 0, "level2_count": 0, "level3_count": 0,
            "yellow_card_months": 0, "red_card_months": 0, "present_days": 0,
            "arrival_minutes_sum": 0.0, "arrival_count": 0,
        }
        for (y, m) in labels:
            s = by_month[(y, m)].get(e["id"])
            if s:
                _punctuality_accumulate(totals, s)
        stats = _punctuality_finalize(totals)
        rows.append({
            "employee_id": e["id"],
            "employee_code": e["employee_code"],
            "name": f"{e['first_name']} {e.get('last_name') or ''}".strip(),
            **stats,
            "aip_instances": aip_counts.get(e["id"], 0),
        })
    return {"scope": scope, "periods": [f"{y}-{m:02d}" for y, m in labels], "employees": rows}
