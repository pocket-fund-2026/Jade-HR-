"""Late-arrival policy endpoints (revision w.e.f. 22 September 2026).

The per-day/per-month grading itself lives in payroll.py and reaches the
console through the payroll summaries (late_mark_count / late_card / red_card).
What needs its own endpoints is the QUARTER Red Card — a Red Card in every
month of a financial-year quarter, whose consequence is a Final Warning letter
plus automatic forfeiture of 2 Paid Leave days (hr_late_policy_actions).
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_permission
from database import supabase
from payroll import (
    LATE_FREE_COUNT_V2,
    LATE_GRACE_MINUTES_V2,
    LATE_HALF_DAY_CUTOFF_V2,
    LATE_LOP_HALF_DAY_V2,
    LATE_LOP_QUARTER_DAY_V2,
    LATE_POLICY_V2_EFFECTIVE,
    QUARTER_RED_CARD_PL_FORFEIT,
    RED_CARD_LATE_MARKS_V2,
    fy_quarter_for_month,
    late_policy_v2_active,
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
    with ThreadPoolExecutor(max_workers=3) as pool:
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
    with ThreadPoolExecutor(max_workers=3) as pool:
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
                "in_policy": late_policy_v2_active(period_end),
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
    return "<br>".join(parts)


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
                "employee_id": row["employee_id"],
                "rendered_body": _substitute(template.data[0]["body"], field_values),
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
