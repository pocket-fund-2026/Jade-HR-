"""Comp-Off accrual — turns the attendance engine's existing eligibility
flags into actual hr_comp_off_ledger credits.

The revised SOP (effective 1 November 2025) credits only weekly-off or
public-holiday work: up to 4 hours earns half a day, above 4 hours earns a
full day, with 120-day validity. Late-night work alone does not qualify.

Idempotent by construction: hr_comp_off_ledger has a UNIQUE (employee_id,
earned_date), so a re-run — or a cron retry — can never double-credit a day.
Deliberately never REVOKES a credit: if attendance is later corrected, HR
adjusts the ledger by hand rather than having a nightly job silently take
back leave someone may already have booked against.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_accounts, require_console
from config import IST
from database import supabase
from routers.leave import COMP_OFF_VALIDITY_DAYS, _comp_off_available
from routers.payroll import (
    _all_summaries_for_month, _fetch_all_compliance_profiles, _fetch_holidays, _pay_period_label_for,
)

router = APIRouter(prefix="/api/comp-off", tags=["comp-off"])
me_router = APIRouter(prefix="/api/me/comp-off", tags=["comp-off"])


def _revised_credit_expiry(row: dict, today: date) -> dict | None:
    """Equivalent to sql/076: preserve used credits and restore valid unused ones."""
    if row["earned_date"] < "2025-11-01":
        return None
    expiry = date.fromisoformat(row["earned_date"]) + timedelta(days=COMP_OFF_VALIDITY_DAYS)
    if row["expiry_date"] == expiry.isoformat():
        return None
    return {
        "expiry_date": expiry.isoformat(),
        "status": "used" if row["status"] == "used" or row.get("used_in_leave_request_id") else
                  "expired" if expiry < today else "available",
    }


@router.post("/reconcile-validity")
def reconcile_comp_off_validity(
    dry_run: bool = Query(default=True),
    user: dict = Depends(require_accounts),
):
    """Accounts-only, idempotent application of migration 076 via the app's DB connection.

    Dry-run by default. Conditional writes protect concurrent leave approvals;
    a conflicting change stops the operation and can safely be retried.
    """
    rows, offset = [], 0
    while True:
        batch = (supabase.table("hr_comp_off_ledger")
                 .select("id,earned_date,expiry_date,status,used_in_leave_request_id")
                 .gte("earned_date", "2025-11-01").order("id").range(offset, offset + 999).execute().data or [])
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += len(batch)
    today = datetime.now(IST).date()
    changes = [(r, patch) for r in rows if (patch := _revised_credit_expiry(r, today))]
    if not dry_run:
        for row, patch in changes:
            query = (supabase.table("hr_comp_off_ledger").update(patch)
                     .eq("id", row["id"]).eq("expiry_date", row["expiry_date"]).eq("status", row["status"]))
            query = query.eq("used_in_leave_request_id", row["used_in_leave_request_id"]) if row.get("used_in_leave_request_id") else query.is_("used_in_leave_request_id", "null")
            if len(query.execute().data or []) != 1:
                raise HTTPException(status_code=409, detail="Ledger changed during reconciliation. Retry to preserve concurrent leave activity.")
    return {"dry_run": dry_run, "reviewed": len(rows), "expiry_updates": len(changes),
            "restored_unused_credits": sum(r["status"] == "expired" and patch["status"] == "available" for r, patch in changes)}


def _accrual_rows_for(summary: dict) -> list[dict]:
    """Every comp-off a single employee's daily attendance says they earned,
    as (earned_date, units, reason) — weekly-off or declared-public-holiday work only."""
    earned = []
    for row in summary.get("daily") or []:
        if row.get("comp_off_eligible"):
            earned.append({
                "earned_date": row["date"],
                "units": float(row.get("comp_off_units") or 1.0),
                "reason": "Worked a weekly off / declared holiday",
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


@router.get("/ledger/all")
def list_all_comp_off(
    status: str | None = Query(default=None, description="available | used | expired"),
    user: dict = Depends(require_console),
):
    """Roster-wide ledger for the HR Comp-Off screen — who has what, where it
    came from, and when it lapses. Per-employee detail stays on the existing
    GET /api/comp-off/{employee_id}."""
    query = supabase.table("hr_comp_off_ledger").select("*").order("earned_date", desc=True)
    rows = query.execute().data or []
    employees = {
        e["id"]: e for e in (
            supabase.table("hr_employees")
            .select("id,employee_code,first_name,last_name,department,location")
            .in_("id", list({r["employee_id"] for r in rows}))
            .execute()
            .data
        ) or []
    } if rows else {}
    today = datetime.now(IST).date()
    out = []
    for r in rows:
        e = employees.get(r["employee_id"], {})
        expiry = date.fromisoformat(r["expiry_date"])
        out.append({
            **r,
            "employee_code": e.get("employee_code"),
            "name": f"{e.get('first_name', '')} {e.get('last_name') or ''}".strip(),
            "department": e.get("department"),
            "location": e.get("location"),
            "effective_status": "expired" if r["status"] == "available" and expiry < today else r["status"],
            "days_to_expiry": (expiry - today).days,
        })
    return [r for r in out if not status or r["effective_status"] == status]
