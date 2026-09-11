"""Comp-Off accrual — turns the attendance engine's existing eligibility
flags into actual hr_comp_off_ledger credits.

The ledger, balance, consumption-on-approval and 120-day expiry all already
existed (routers/leave.py), and payroll.py has long computed BOTH eligibility
signals per day:

  comp_off_eligible     — worked a weekly off or a declared holiday
                          (v1.1 section 5), 0.5 units under 4h else 1.0
  comp_off_eligible_v3  — work continuing past 12:30 AM (v3 doc section 21)

...but nothing ever wrote them to the ledger, so every balance was zero and
the feature was effectively dead. This scan closes that loop.

Idempotent by construction: hr_comp_off_ledger has a UNIQUE (employee_id,
earned_date), so a re-run — or a cron retry — can never double-credit a day.
Deliberately never REVOKES a credit: if attendance is later corrected, HR
adjusts the ledger by hand rather than having a nightly job silently take
back leave someone may already have booked against.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query

from auth import get_current_user, require_console
from config import IST
from database import supabase
from routers.leave import COMP_OFF_VALIDITY_DAYS, _comp_off_available
from routers.payroll import (
    _all_summaries_for_month, _fetch_all_compliance_profiles, _fetch_holidays, _pay_period_label_for,
)

router = APIRouter(prefix="/api/comp-off", tags=["comp-off"])
me_router = APIRouter(prefix="/api/me/comp-off", tags=["comp-off"])

# Work past 12:30 AM earns a full day (v3 section 21) — unlike weekly-off /
# holiday work, which is half a day under 4 hours (payroll.comp_off_units).
MIDNIGHT_COMP_OFF_UNITS = 1.0


def _accrual_rows_for(summary: dict) -> list[dict]:
    """Every comp-off a single employee's daily attendance says they earned,
    as (earned_date, units, reason) — both the weekly-off/holiday kind and
    the past-midnight kind."""
    earned = []
    for row in summary.get("daily") or []:
        if row.get("comp_off_eligible"):
            earned.append({
                "earned_date": row["date"],
                "units": float(row.get("comp_off_units") or 1.0),
                "reason": "Worked a weekly off / declared holiday",
            })
        elif row.get("comp_off_eligible_v3"):
            earned.append({
                "earned_date": row["date"],
                "units": MIDNIGHT_COMP_OFF_UNITS,
                "reason": "Work continued past 12:30 AM",
            })
    return earned


@router.post("/accrual-scan")
def comp_off_accrual_scan(
    year: int | None = Query(default=None),
    month: int | None = Query(default=None),
    dry_run: bool = Query(default=False),
    user: dict = Depends(require_console),
):
    """Credits every comp-off earned in the given pay period (default: the
    current one). Safe to run repeatedly — the ledger's unique constraint on
    (employee_id, earned_date) means an already-credited day is skipped, not
    duplicated.

    Gated on require_console so the existing sync account can drive it from
    cron, same as the late digest and absence scan.
    """
    today = datetime.now(IST).date()
    if year is None or month is None:
        year, month = _pay_period_label_for(today)

    with ThreadPoolExecutor(max_workers=3) as pool:
        employees_future = pool.submit(
            lambda: supabase.table("hr_employees").select("*").eq("is_active", True).execute().data
        )
        profiles_future = pool.submit(_fetch_all_compliance_profiles)
        holidays_future = pool.submit(_fetch_holidays)
        employees = employees_future.result()
        profiles_by_employee = profiles_future.result()
        holidays = holidays_future.result()

    summaries = _all_summaries_for_month(
        employees, profiles_by_employee, holidays, year, month, keep_daily=True,
    )

    existing = (
        supabase.table("hr_comp_off_ledger").select("employee_id,earned_date").execute().data
    ) or []
    already = {(r["employee_id"], r["earned_date"]) for r in existing}

    credited, skipped = [], 0
    for summary in summaries:
        for entry in _accrual_rows_for(summary):
            key = (summary["employee_id"], entry["earned_date"])
            if key in already:
                skipped += 1
                continue
            already.add(key)
            credited.append({
                "employee_id": summary["employee_id"],
                "employee_code": summary["employee_code"],
                "name": summary["name"],
                **entry,
            })

    if credited and not dry_run:
        supabase.table("hr_comp_off_ledger").insert([
            {
                "employee_id": c["employee_id"],
                "earned_date": c["earned_date"],
                "units": c["units"],
                "expiry_date": (
                    date.fromisoformat(c["earned_date"]) + timedelta(days=COMP_OFF_VALIDITY_DAYS)
                ).isoformat(),
            }
            for c in credited
        ]).execute()

    return {
        "period": {"year": year, "month": month},
        "credited_count": len(credited),
        "already_credited_skipped": skipped,
        "credited": [{k: v for k, v in c.items() if k != "employee_id"} for c in credited],
        "dry_run": dry_run,
    }


@me_router.get("")
def my_comp_off(user: dict = Depends(get_current_user)):
    """The signed-in employee's own comp-off balance and where it came from —
    so "I worked that Sunday, where's my day?" is answerable without asking
    HR. Expired and used entries are returned too, since the usual question
    is about one that has already gone."""
    rows = (
        supabase.table("hr_comp_off_ledger")
        .select("*")
        .eq("employee_id", user["id"])
        .order("earned_date", desc=True)
        .execute()
        .data
    ) or []
    today = datetime.now(IST).date()
    entries = []
    for r in rows:
        expiry = date.fromisoformat(r["expiry_date"])
        entries.append({
            **r,
            # A row can be 'available' in the table but already past its
            # expiry date if no sweep has run — show it as expired rather
            # than promising a day they can't actually take.
            "effective_status": "expired" if r["status"] == "available" and expiry < today else r["status"],
            "days_to_expiry": (expiry - today).days,
        })
    return {
        "balance": _comp_off_available(user["id"]),
        "validity_days": COMP_OFF_VALIDITY_DAYS,
        "entries": entries,
    }
