import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

import email_service
from auth import CONSOLE_ROLES, get_current_user, require_console, require_permission, user_can
from config import IST
from database import maybe_single_data, supabase
from models import SalaryHoldUpdate
from payroll import (
    WEEKOFF_LOOKBACK_DAYS, compute_attendance_for_range, compute_monthly_summary, fy_label_for_month,
    pay_period_bounds,
)
from routers.leave import (
    fetch_all_approved_leaves_by_employee, fetch_approved_leaves, pl_ledger_for_period, pl_ledger_for_period_bulk,
)
from routers.wfh import fetch_all_confirmed_wfh_by_employee, fetch_confirmed_wfh
from tds import DEFAULT_DECLARATION, project_annual_tax

router = APIRouter(prefix="/api", tags=["payroll"])
logger = logging.getLogger("jade_hr.payroll")


def _reporting_manager_emails(employee_ids: set[str]) -> dict[str, list[str]]:
    """Resolves late_digest's late employees to their actual reporting
    manager's email(s), keyed by employee_id — the real per-employee
    reporting line (hr_employee_profile.reporting_to_id / .reporting_to_email,
    the same fields leave.py uses for approver notifications). Previously this
    was keyed off hr_employee_profile.head_of_department, but in practice
    nobody was ever flagged as a HOD so that path never sent a single email —
    reporting_to_id is already populated (it's what drives leave-approval
    routing) so it actually works."""
    employee_ids = {e for e in employee_ids if e}
    if not employee_ids:
        return {}
    profile_resp = (
        supabase.table("hr_employee_profile")
        .select("employee_id,reporting_to_id,reporting_to_email")
        .in_("employee_id", list(employee_ids))
        .execute()
    )
    profiles = profile_resp.data or []
    manager_ids = {p["reporting_to_id"] for p in profiles if p.get("reporting_to_id")}
    manager_email_by_id: dict[str, str] = {}
    if manager_ids:
        mgr_resp = supabase.table("hr_employees").select("id,email,is_active").in_("id", list(manager_ids)).execute()
        manager_email_by_id = {
            m["id"]: m["email"] for m in (mgr_resp.data or []) if m.get("email") and m.get("is_active", True)
        }
    result: dict[str, list[str]] = {}
    for p in profiles:
        emails = list(dict.fromkeys(e for e in [
            manager_email_by_id.get(p.get("reporting_to_id")), p.get("reporting_to_email"),
        ] if e))
        if emails:
            result[p["employee_id"]] = emails
    missing = employee_ids - result.keys()
    if missing:
        logger.warning("late_digest: no reporting-manager email found for employee_ids %r", missing)
    return result


def _month_bounds(year: int, month: int, calendar_month: bool = False) -> tuple[str, str]:
    """Pay-period bounds (23rd of prior month - 22nd of this month), as UTC
    instants — the period is defined in IST wall-clock time, so midnight IST
    on each boundary date is what actually delimits it. calendar_month=True
    spans the true calendar month instead (ESIC report).

    Widened WEEKOFF_LOOKBACK_DAYS earlier at the start so the punch fetchers
    below always pull enough prior-period data for compute_daily_attendance's
    weekly-off earning-rule lookback (see WEEKOFF_LOOKBACK_DAYS in payroll.py)
    — compute_daily_attendance trims the extra lead-in days itself before
    returning, so callers never see them in the final result."""
    start, end = pay_period_bounds(year, month, calendar_month)
    start -= timedelta(days=WEEKOFF_LOOKBACK_DAYS)
    from_dt = datetime.combine(start, datetime.min.time(), tzinfo=IST).isoformat()
    to_dt = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=IST).isoformat()
    return from_dt, to_dt


def _parse_time(t: str | None) -> time | None:
    return time.fromisoformat(t) if t else None


def _fetch_punch_times(employee_code: str, year: int, month: int) -> list[datetime]:
    from_dt, to_dt = _month_bounds(year, month)
    resp = (
        supabase.table("hr_biometric_punches")
        .select("punch_time")
        .eq("employee_code", employee_code)
        .gte("punch_time", from_dt)
        .lte("punch_time", to_dt)
        .execute()
    )
    return [datetime.fromisoformat(r["punch_time"]) for r in resp.data]


def _fetch_punch_times_range(employee_code: str, start: date, end: date) -> list[datetime]:
    """`start`/`end` are the range actually requested by the caller — widened
    by WEEKOFF_LOOKBACK_DAYS at the front here for the same reason as
    _month_bounds; compute_attendance_for_range trims the lead-in days."""
    start -= timedelta(days=WEEKOFF_LOOKBACK_DAYS)
    from_dt = datetime.combine(start, datetime.min.time(), tzinfo=IST).isoformat()
    to_dt = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=IST).isoformat()
    resp = (
        supabase.table("hr_biometric_punches")
        .select("punch_time")
        .eq("employee_code", employee_code)
        .gte("punch_time", from_dt)
        .lte("punch_time", to_dt)
        .execute()
    )
    return [datetime.fromisoformat(r["punch_time"]) for r in resp.data]


def _fetch_all_punches_by_employee(year: int, month: int, calendar_month: bool = False) -> dict[str, list[datetime]]:
    """One (paginated) query for the whole month instead of one query per employee."""
    from_dt, to_dt = _month_bounds(year, month, calendar_month)
    by_employee: dict[str, list[datetime]] = {}
    page_size = 1000
    start = 0
    while True:
        resp = (
            supabase.table("hr_biometric_punches")
            .select("employee_code,punch_time")
            .gte("punch_time", from_dt)
            .lte("punch_time", to_dt)
            .range(start, start + page_size - 1)
            .execute()
        )
        rows = resp.data
        for r in rows:
            by_employee.setdefault(r["employee_code"], []).append(datetime.fromisoformat(r["punch_time"]))
        if len(rows) < page_size:
            break
        start += page_size
    return by_employee


def _fetch_all_punches_by_employee_range(start: date, end: date) -> dict[str, list[datetime]]:
    """Range equivalent of _fetch_all_punches_by_employee — one (paginated)
    query for an arbitrary [start, end] span across the whole roster,
    instead of one query per employee. `start` widened by WEEKOFF_LOOKBACK_DAYS
    at the front for the same reason as _fetch_punch_times_range."""
    start -= timedelta(days=WEEKOFF_LOOKBACK_DAYS)
    from_dt = datetime.combine(start, datetime.min.time(), tzinfo=IST).isoformat()
    to_dt = datetime.combine(end + timedelta(days=1), datetime.min.time(), tzinfo=IST).isoformat()
    by_employee: dict[str, list[datetime]] = {}
    page_size = 1000
    offset = 0
    while True:
        resp = (
            supabase.table("hr_biometric_punches")
            .select("employee_code,punch_time")
            .gte("punch_time", from_dt)
            .lte("punch_time", to_dt)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = resp.data
        for r in rows:
            by_employee.setdefault(r["employee_code"], []).append(datetime.fromisoformat(r["punch_time"]))
        if len(rows) < page_size:
            break
        offset += page_size
    return by_employee


def _fetch_all_overrides_by_employee_range(start: date, end: date) -> dict[str, dict[date, dict]]:
    """`start` widened by WEEKOFF_LOOKBACK_DAYS at the front for the same
    reason as _fetch_punch_times_range."""
    start -= timedelta(days=WEEKOFF_LOOKBACK_DAYS)
    resp = (
        supabase.table("hr_attendance_overrides")
        .select("*")
        .gte("date", start.isoformat())
        .lte("date", end.isoformat())
        .execute()
    )
    by_employee: dict[str, dict[date, dict]] = {}
    for r in resp.data:
        by_employee.setdefault(r["employee_id"], {})[date.fromisoformat(r["date"])] = {
            "status_override": r["status_override"],
            "first_in": _parse_time(r["first_in"]),
            "last_out": _parse_time(r["last_out"]),
        }
    return by_employee


def _fetch_overrides(employee_id: str, year: int, month: int) -> dict[date, dict]:
    start, end = pay_period_bounds(year, month)
    start -= timedelta(days=WEEKOFF_LOOKBACK_DAYS)
    from_d, to_d = start.isoformat(), end.isoformat()
    resp = (
        supabase.table("hr_attendance_overrides")
        .select("*")
        .eq("employee_id", employee_id)
        .gte("date", from_d)
        .lte("date", to_d)
        .execute()
    )
    return {
        date.fromisoformat(r["date"]): {
            "status_override": r["status_override"],
            "first_in": _parse_time(r["first_in"]),
            "last_out": _parse_time(r["last_out"]),
        }
        for r in resp.data
    }


def _fetch_overrides_range(employee_id: str, start: date, end: date) -> dict[date, dict]:
    """`start` widened by WEEKOFF_LOOKBACK_DAYS at the front for the same
    reason as _fetch_punch_times_range."""
    start -= timedelta(days=WEEKOFF_LOOKBACK_DAYS)
    resp = (
        supabase.table("hr_attendance_overrides")
        .select("*")
        .eq("employee_id", employee_id)
        .gte("date", start.isoformat())
        .lte("date", end.isoformat())
        .execute()
    )
    return {
        date.fromisoformat(r["date"]): {
            "status_override": r["status_override"],
            "first_in": _parse_time(r["first_in"]),
            "last_out": _parse_time(r["last_out"]),
        }
        for r in resp.data
    }


def _fetch_all_overrides_by_employee(year: int, month: int, calendar_month: bool = False) -> dict[str, dict[date, dict]]:
    start, end = pay_period_bounds(year, month, calendar_month)
    start -= timedelta(days=WEEKOFF_LOOKBACK_DAYS)
    from_d, to_d = start.isoformat(), end.isoformat()
    resp = (
        supabase.table("hr_attendance_overrides")
        .select("*")
        .gte("date", from_d)
        .lte("date", to_d)
        .execute()
    )
    by_employee: dict[str, dict[date, dict]] = {}
    for r in resp.data:
        by_employee.setdefault(r["employee_id"], {})[date.fromisoformat(r["date"])] = {
            "status_override": r["status_override"],
            "first_in": _parse_time(r["first_in"]),
            "last_out": _parse_time(r["last_out"]),
        }
    return by_employee


def _get_active_employee(employee_id: str) -> dict:
    resp = supabase.table("hr_employees").select("*").eq("id", employee_id).maybe_single().execute()
    data = maybe_single_data(resp)
    if not data:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {**data, **_fetch_compliance_profile(employee_id)}


# PF/ESIC/PT/LWF applicability, PF wage ceiling, gender (for Maharashtra's PT
# women's exemption), the payslip-header identity fields (PAN/UAN/Aadhar/
# PF No/ESIC No/Payment Mode), and time_slot (Saturday-shift-hours lookup —
# see payroll.py's SATURDAY_SHIFT_HOURS) all live on hr_employee_profile,
# not hr_employees — merge them in so compute_monthly_summary can see them.
COMPLIANCE_COLUMNS = (
    "employee_id,pf_applicable,eps_applicable,pf_gross_limit,esic_applicable,"
    "pt_applicable,lwf_applicable,gender,pan_no,uan_no,aadhar_no,pf_no,esic_no,payment_mode,"
    "bank_name,bank_account_no,bank_ifsc,exit_date,date_of_birth,grade,cost_center,time_slot"
)


def _fetch_compliance_profile(employee_id: str) -> dict:
    resp = (
        supabase.table("hr_employee_profile")
        .select(COMPLIANCE_COLUMNS)
        .eq("employee_id", employee_id)
        .maybe_single()
        .execute()
    )
    return maybe_single_data(resp) or {}


def _fetch_all_compliance_profiles() -> dict[str, dict]:
    resp = supabase.table("hr_employee_profile").select(COMPLIANCE_COLUMNS).execute()
    return {r["employee_id"]: r for r in resp.data}


def _fetch_holidays() -> list[dict]:
    """Small, mostly-static table — one unfiltered fetch per request is fine.
    Returns every location's rows; compute_monthly_summary resolves which
    ones apply to a given employee (see payroll.py's _holidays_for_employee)."""
    resp = supabase.table("hr_holidays").select("holiday_date,description,day_type,location,close_time").execute()
    return resp.data


SALARY_STRUCTURE_PERIOD_FIELDS = (
    "earn_arrear", "earn_bonus", "earn_leave_encash", "earn_performance_linked_pay",
    "ded_vpf", "ded_loan", "ded_loan_int", "ded_other_ded", "ded_salary_advance", "ded_pf_arrear",
)


def _fetch_all_arrears_by_employee(year: int, month: int) -> dict[str, dict]:
    """Salary Sheet/Lumpsum Report's one-off manual line items — Arrear,
    Bonus, Leave Encash, Performance Linked Pay, VPF, Loan, Loan Interest,
    Other Deduction, Salary Advance, PF Arrear — from any hr_salary_structure
    revision effective within this pay period (the same figures
    /api/reports/arrears reports on for Arrear specifically), summed per
    employee in the rare case of more than one revision in a single period."""
    start, end = pay_period_bounds(year, month)
    resp = (
        supabase.table("hr_salary_structure")
        .select("employee_id," + ",".join(SALARY_STRUCTURE_PERIOD_FIELDS))
        .gte("effective_date", start.isoformat())
        .lte("effective_date", end.isoformat())
        .execute()
    )
    by_employee: dict[str, dict] = {}
    for r in resp.data:
        agg = by_employee.setdefault(r["employee_id"], {f: 0.0 for f in SALARY_STRUCTURE_PERIOD_FIELDS})
        for f in SALARY_STRUCTURE_PERIOD_FIELDS:
            agg[f] += float(r[f] or 0)

    # Standalone quick-entry arrears (hr_arrears — see sql/051) fold into the
    # same "earn_arrear" figure additively, since they're the same kind of
    # one-off line item, just entered without a full CTC revision.
    standalone = (
        supabase.table("hr_arrears")
        .select("employee_id,arrear_amount")
        .gte("effective_date", start.isoformat())
        .lte("effective_date", end.isoformat())
        .execute()
    )
    for r in standalone.data:
        agg = by_employee.setdefault(r["employee_id"], {f: 0.0 for f in SALARY_STRUCTURE_PERIOD_FIELDS})
        agg["earn_arrear"] += float(r["arrear_amount"] or 0)
    return by_employee


def _fetch_all_tax_declarations(financial_year: str) -> dict[str, dict]:
    resp = supabase.table("hr_tax_declarations").select("*").eq("financial_year", financial_year).execute()
    return {r["employee_id"]: r for r in resp.data}


def _monthly_tds(employee: dict, year: int, month: int, declaration: dict | None = None) -> float:
    """TDS to deduct on this specific payslip — projects the employee's
    annual tax under their declared regime and divides by the FY months
    remaining from this one. See tds.py for the projection methodology and
    its documented simplifications."""
    financial_year = fy_label_for_month(year, month)
    if declaration is None:
        resp = (
            supabase.table("hr_tax_declarations")
            .select("*")
            .eq("employee_id", employee["id"])
            .eq("financial_year", financial_year)
            .maybe_single()
            .execute()
        )
        declaration = maybe_single_data(resp) or DEFAULT_DECLARATION
    return project_annual_tax(employee, financial_year, declaration, year, month)["monthly_tds"]


def _all_summaries_for_month(
    employees: list[dict], profiles_by_employee: dict[str, dict], holidays: dict[date, dict],
    year: int, month: int, keep_daily: bool = False, calendar_month: bool = False,
) -> list[dict]:
    """Shared by payroll_for_month and payroll_for_range — one bulk fetch of
    punches/overrides/leaves/tax-declarations for the month, then
    compute_monthly_summary per employee (employees/profiles/holidays are
    passed in so callers spanning multiple months don't refetch the
    roster/compliance data every time). `keep_daily` keeps each summary's
    per-day breakdown instead of dropping it — the bulk payroll views don't
    need it (223 employees x ~30 days adds up), but the Attendance Sheet
    report is exactly that daily breakdown, all employees at once.

    The 4 bulk fetches below are independent reads (different tables, no
    data dependency on each other) — running them concurrently instead of
    one after another cuts this function's network-wait time roughly 4x,
    since each one is pure I/O wait on the same shared httpx client."""
    with ThreadPoolExecutor(max_workers=5) as pool:
        punches_future = pool.submit(_fetch_all_punches_by_employee, year, month, calendar_month)
        overrides_future = pool.submit(_fetch_all_overrides_by_employee, year, month, calendar_month)
        leaves_future = pool.submit(fetch_all_approved_leaves_by_employee, year, month, calendar_month)
        wfh_future = pool.submit(fetch_all_confirmed_wfh_by_employee, year, month, calendar_month)
        declarations_future = pool.submit(_fetch_all_tax_declarations, fy_label_for_month(year, month))
        punches_by_employee = punches_future.result()
        overrides_by_employee = overrides_future.result()
        leaves_by_employee = leaves_future.result()
        wfh_by_employee = wfh_future.result()
        declarations_by_employee = declarations_future.result()
    summaries = []
    for employee in employees:
        employee = {**employee, **profiles_by_employee.get(employee["id"], {})}
        punches = punches_by_employee.get(employee["employee_code"], [])
        overrides = overrides_by_employee.get(employee["id"], {})
        leaves = leaves_by_employee.get(employee["id"], {})
        wfh_days = wfh_by_employee.get(employee["id"], {})
        # Bulk path: a missing entry means "no declaration saved", not "go
        # fetch it individually" — must never fall through to _monthly_tds's
        # per-employee DB query, or this reintroduces an N+1 for every
        # employee who hasn't filled in a declaration yet.
        declaration = declarations_by_employee.get(employee["id"]) or DEFAULT_DECLARATION
        monthly_tds = _monthly_tds(employee, year, month, declaration)
        summary = compute_monthly_summary(
            employee, year, month, punches, overrides, leaves, holidays, monthly_tds,
            calendar_month=calendar_month, wfh_days=wfh_days,
        )
        if not keep_daily:
            summary.pop("daily")
        summaries.append(summary)
    return summaries


@router.get("/payroll")
def payroll_for_month(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: dict = Depends(require_permission("payroll.view")),
):
    with ThreadPoolExecutor(max_workers=3) as pool:
        employees_future = pool.submit(
            lambda: supabase.table("hr_employees").select("*").eq("is_active", True).execute().data
        )
        profiles_future = pool.submit(_fetch_all_compliance_profiles)
        holidays_future = pool.submit(_fetch_holidays)
        employees = employees_future.result()
        profiles_by_employee = profiles_future.result()
        holidays = holidays_future.result()

    merged_employees = [{**employee, **profiles_by_employee.get(employee["id"], {})} for employee in employees]
    # summaries/ledgers/arrears are independent of each other — only the
    # zip() below needs all three, so compute them concurrently too.
    with ThreadPoolExecutor(max_workers=3) as pool:
        summaries_future = pool.submit(_all_summaries_for_month, employees, profiles_by_employee, holidays, year, month)
        ledgers_future = pool.submit(pl_ledger_for_period_bulk, merged_employees, year, month)
        arrears_future = pool.submit(_fetch_all_arrears_by_employee, year, month)
        summaries = summaries_future.result()
        ledgers_by_employee = ledgers_future.result()
        arrears_by_employee = arrears_future.result()
    for employee, summary in zip(employees, summaries):
        summary["pl_ledger"] = ledgers_by_employee.get(employee["id"])
        period_items = arrears_by_employee.get(employee["id"], {})
        summary["arrear"] = round(period_items.get("earn_arrear", 0), 2)
        for field in SALARY_STRUCTURE_PERIOD_FIELDS:
            if field != "earn_arrear":
                summary[field] = round(period_items.get(field, 0), 2)
    return summaries


@router.get("/esic-report")
def esic_report(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: dict = Depends(require_permission("payroll.view")),
):
    """ESIC Sheet/Challan rows for the CALENDAR month (1st-last), not the
    23rd-22nd payroll cycle — ESIC is a calendar-month statutory return.
    Returns only ESIC-applicable employees who accrued wages in the month
    (esic_wages > 0). ESIC contributions come already rounded up to whole
    rupees from statutory.compute_esic; the report layer adds no rounding."""
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
        employees, profiles_by_employee, holidays, year, month, calendar_month=True
    )
    return [s for s in summaries if (s.get("esic_wages") or 0) > 0]


def _pay_period_label_for(d: date) -> tuple[int, int]:
    """The (year, month) pay-period label whose 23rd-of-prior-month → 22nd
    window contains date `d`. Mirrors leave.py's _current_pay_period."""
    if d.day <= 22:
        return d.year, d.month
    month, year = d.month + 1, d.year
    if month > 12:
        month, year = 1, year + 1
    return year, month


@router.post("/attendance/late-digest")
def late_digest(
    for_date: date | None = Query(default=None),
    dry_run: bool = Query(default=False),
    user: dict = Depends(require_console),
):
    """Daily late-marking digest: one email to HR listing every corporate
    employee whose first punch on `for_date` (default: today, IST) was after
    their applicable on-time cutoff (10:00 AM under Policy v3, banded from
    there — or the pre-v3 10:11 AM grace for a date before v3 took effect;
    either way, extended by the stay-back grace to 11 AM / noon when it
    applies). Separately, each late employee's actual reporting manager gets
    their OWN email listing ONLY their reportees' late entries that day —
    never the full company-wide list HR gets (see _reporting_manager_emails).

    'Late' here is exactly the payslip's own late flag: it runs the same
    attendance engine (overrides, approved leave, holidays, weekly-off and
    stay-back grace all honoured), then reads out that one day's row — so the
    digest and the month-end payslip can never disagree. Only corporate-roster
    staff are included, since the late policy only governs them.

    Triggered once a day by the cron in /etc/cron.d/jade-hr-sync, after the
    morning punch sync has landed the day's clock-ins. Note the punch data is
    only as fresh as that last sync (arrivals after it show up the next run).
    `dry_run` returns the list WITHOUT sending, for safe verification; the
    real run sends nothing on a day with no late arrivals (no empty emails).
    Gated on require_console so the sync account (already console-capable for
    /api/biometric/ingest) can call it — no new credential needed.
    """
    target = for_date or datetime.now(IST).date()
    target_iso = target.isoformat()
    year, month = _pay_period_label_for(target)

    with ThreadPoolExecutor(max_workers=3) as pool:
        employees_future = pool.submit(
            lambda: supabase.table("hr_employees").select("*").eq("is_active", True).execute().data
        )
        profiles_future = pool.submit(_fetch_all_compliance_profiles)
        holidays_future = pool.submit(_fetch_holidays)
        employees = employees_future.result()
        profiles_by_employee = profiles_future.result()
        holidays = holidays_future.result()

    corporate = [e for e in employees if e.get("employee_category") == "corporate"]
    summaries = _all_summaries_for_month(
        corporate, profiles_by_employee, holidays, year, month, keep_daily=True,
    )

    late = []
    for summary in summaries:
        row = next((r for r in summary["daily"] if r["date"] == target_iso), None)
        if row and row["status"] == "present" and row.get("late"):
            first_in = row.get("first_in")
            in_time = (
                datetime.fromisoformat(first_in).astimezone(IST).strftime("%I:%M %p").lstrip("0")
                if first_in else "—"
            )
            late.append({
                "employee_id": summary["employee_id"],
                "employee_code": summary["employee_code"],
                "name": summary["name"],
                "location": summary["location"],
                "department": summary.get("department"),
                "time": in_time,
                "sort_key": first_in or "",
            })
    late.sort(key=lambda x: x["sort_key"])
    for e in late:
        e.pop("sort_key", None)

    public_late = [{k: v for k, v in e.items() if k != "employee_id"} for e in late]
    emailed, email_error = False, None
    hod_digests: list[dict] = []
    if not dry_run:
        emailed, email_error = email_service.notify_late_digest(target_iso, public_late, email_service.HR_NOTIFY_EMAIL)
        # Each reporting manager gets their OWN reportees' late list only —
        # never the full company-wide one HR gets above. Grouped by manager
        # email (not department/HOD flag — see _reporting_manager_emails).
        manager_emails_by_employee = _reporting_manager_emails({e["employee_id"] for e in late})
        late_by_manager_email: dict[str, list[dict]] = {}
        for e in late:
            for manager_email in manager_emails_by_employee.get(e["employee_id"], []):
                late_by_manager_email.setdefault(manager_email, []).append(
                    {k: v for k, v in e.items() if k != "employee_id"}
                )
        for manager_email, mgr_late in late_by_manager_email.items():
            ok, err = email_service.notify_late_digest(target_iso, mgr_late, manager_email, include_report_link=False)
            hod_digests.append({"recipient": manager_email, "count": len(mgr_late), "emailed": ok, "email_error": err})
    return {
        "date": target_iso, "count": len(late), "late": public_late,
        "emailed": emailed, "email_error": email_error, "hod_digests": hod_digests,
    }


# More than this many CONSECUTIVE unapproved absent days puts salary on hold
# (HR instruction, 10 Sept 2026). Consecutive, not cumulative — it mirrors
# the offer letter's own continuous-absence clause, so scattered odd days
# off through the month never trip it.
SALARY_HOLD_ABSENCE_DAYS = 5


# Non-working days don't count AS absence, but they don't interrupt it
# either — someone absent Mon-Fri, off Saturday, then absent again Sun-Mon
# has been gone 8 days, and letting the weekly-off reset the counter would
# hide exactly the long absences this scan exists to catch.
_ABSENCE_RUN_PASSTHROUGH = ("weekoff", "holiday")


def _longest_trailing_absence_run(daily: list[dict], today_iso: str) -> tuple[int, str, str] | None:
    """The run of unapproved absent days still in progress as of today —
    counting only 'absent' days, but reading THROUGH weekly-offs and closed
    holidays (see above). Returns (absent_days, start_iso, end_iso), or None
    if the most recent working day wasn't an absence.

    payroll.py resolves approved leave to 'leave' and WFH to 'wfh', so an
    'absent' row is by construction an UNAPPROVED absence. Because the walk
    starts at the most recent day and stops dead on the first present/leave/
    wfh day, anything it returns is necessarily still ongoing — a run they
    already came back from can never reach the end of the list."""
    past = [r for r in daily if r["date"] <= today_iso and r["status"] != "future"]
    absent_dates: list[str] = []
    for row in reversed(past):
        if row["status"] in _ABSENCE_RUN_PASSTHROUGH:
            continue
        if row["status"] != "absent":
            break
        absent_dates.append(row["date"])
    if not absent_dates:
        return None
    absent_dates.reverse()
    return len(absent_dates), absent_dates[0], absent_dates[-1]


@router.post("/attendance/absence-hold-scan")
def absence_hold_scan(
    dry_run: bool = Query(default=False),
    user: dict = Depends(require_console),
):
    """Flags anyone currently on a run of MORE than SALARY_HOLD_ABSENCE_DAYS
    consecutive unapproved absent days, sets salary_hold on their profile,
    and alerts Rushikesh (Accounts) + HR in one email.

    Only counts a run that is still ongoing (ends today or yesterday) — an
    absence someone has already returned from is water under the bridge as
    far as holding the current salary goes. Idempotent: an employee already
    on hold is skipped, so re-running (or a cron retry) never re-alerts or
    overwrites the original hold reason. The hold is never lifted here —
    only HR/Accounts clears it (see set_salary_hold), so returning to work
    doesn't silently release it.

    Gated on require_console so the existing sync account can drive it from
    cron, same as the late digest above.
    """
    today = datetime.now(IST).date()
    today_iso = today.isoformat()
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

    already_held = {
        p["employee_id"] for p in (
            supabase.table("hr_employee_profile").select("employee_id,salary_hold").execute().data or []
        ) if p.get("salary_hold")
    }

    flagged, skipped_already_held = [], []
    for summary in summaries:
        run = _longest_trailing_absence_run(summary.get("daily") or [], today_iso)
        if not run:
            continue
        days, start_iso, end_iso = run
        if days <= SALARY_HOLD_ABSENCE_DAYS:
            continue
        entry = {
            "employee_id": summary["employee_id"],
            "employee_code": summary["employee_code"],
            "name": summary["name"],
            "days": days,
            "start": start_iso,
            "end": end_iso,
        }
        if summary["employee_id"] in already_held:
            skipped_already_held.append(entry)
            continue
        flagged.append(entry)

    emailed, email_error = False, None
    if flagged and not dry_run:
        now_iso = datetime.now(timezone.utc).isoformat()
        for f in flagged:
            supabase.table("hr_employee_profile").upsert(
                {
                    "employee_id": f["employee_id"],
                    "salary_hold": True,
                    "salary_hold_reason": (
                        f"{f['days']} consecutive unapproved absent days ({f['start']} to {f['end']}) — "
                        f"auto-flagged by the absence scan"
                    ),
                    "salary_hold_since": today_iso,
                    "updated_at": now_iso,
                },
                on_conflict="employee_id",
            ).execute()
        emailed, email_error = email_service.notify_salary_hold(
            [{k: v for k, v in f.items() if k != "employee_id"} for f in flagged],
            [email_service.SALARY_HOLD_NOTIFY_EMAIL, email_service.HR_NOTIFY_EMAIL],
        )

    return {
        "date": today_iso,
        "threshold_days": SALARY_HOLD_ABSENCE_DAYS,
        "newly_held": [{k: v for k, v in f.items() if k != "employee_id"} for f in flagged],
        "already_on_hold": [{k: v for k, v in f.items() if k != "employee_id"} for f in skipped_already_held],
        "emailed": emailed,
        "email_error": email_error,
    }


@router.put("/employees/{employee_id}/salary-hold")
def set_salary_hold(
    employee_id: str,
    body: SalaryHoldUpdate,
    user: dict = Depends(require_permission("salary.edit")),
):
    """HR/Accounts setting or (more usually) clearing a salary hold. Kept on
    salary.edit rather than employees.manage — it's a pay decision, so it
    belongs with whoever can already change pay."""
    updates = {
        "employee_id": employee_id,
        "salary_hold": body.salary_hold,
        "salary_hold_reason": body.reason,
        "salary_hold_since": datetime.now(IST).date().isoformat() if body.salary_hold else None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }
    supabase.table("hr_employee_profile").upsert(updates, on_conflict="employee_id").execute()
    return {"ok": True, "salary_hold": body.salary_hold}


MAX_RANGE_MONTHS = 12  # each month re-fetches punches/overrides/leaves/declarations
# and recomputes attendance for every employee (~3-4s/month for 200 active
# employees) — keep bounded so a serverless request doesn't approach the
# Vercel function timeout (see vercel.json's maxDuration).


def _months_in_range(from_year: int, from_month: int, to_year: int, to_month: int) -> list[tuple[int, int]]:
    months = []
    y, m = from_year, from_month
    while (y, m) <= (to_year, to_month):
        months.append((y, m))
        m += 1
        if m > 12:
            m, y = 1, y + 1
    return months


# Fields summed across the range in payroll_for_range — everything else
# (name/location/designation/etc.) is taken from whichever month's summary
# happens to be seen first, since those don't vary month to month in practice.
RANGE_SUM_FIELDS = (
    "basic", "hra", "conveyance", "other_allowance", "monthly_bonus", "retention", "incentive",
    "ot_amount", "lop_amount", "ded_pf", "ded_esic", "ded_pt", "ded_lwf", "ded_tds", "ded_standing_loan",
    "pf_wages", "pf_employer_eps", "pf_employer_epf", "pf_edli_charges", "pf_admin_charges",
    "esic_wages", "esic_employer", "lwf_employer",
    "present_days", "paid_days", "without_pay_days", "total_hours_worked", "total_ot_hours",
    "gross_salary", "total_payable",
)
RANGE_CARRY_FIELDS = ("employee_code", "name", "location", "designation", "department", "employee_category")


@router.get("/payroll/range")
def payroll_for_range(
    from_year: int = Query(...),
    from_month: int = Query(..., ge=1, le=12),
    to_year: int = Query(...),
    to_month: int = Query(..., ge=1, le=12),
    user: dict = Depends(require_permission("payroll.view")),
):
    """Sums each employee's payslip figures across a From-To range of pay
    periods — for the Yearly/Cumulative Salary Details and CTC-As-Per-Payslip
    reports. Recomputes compute_monthly_summary for every month in the range
    (attendance/OT/statutory deductions are only ever computed per pay
    period), so it's capped at MAX_RANGE_MONTHS to keep this from becoming an
    unbounded, slow request."""
    if (to_year, to_month) < (from_year, from_month):
        raise HTTPException(status_code=400, detail="'To' period must be on or after 'From' period")
    months = _months_in_range(from_year, from_month, to_year, to_month)
    if len(months) > MAX_RANGE_MONTHS:
        raise HTTPException(status_code=400, detail=f"Range too large — max {MAX_RANGE_MONTHS} months")

    with ThreadPoolExecutor(max_workers=3) as pool:
        employees_future = pool.submit(
            lambda: supabase.table("hr_employees").select("*").eq("is_active", True).execute().data
        )
        profiles_future = pool.submit(_fetch_all_compliance_profiles)
        holidays_future = pool.submit(_fetch_holidays)
        employees = employees_future.result()
        profiles_by_employee = profiles_future.result()
        holidays = holidays_future.result()

    # Each month is a fully independent computation (same employees/profiles/
    # holidays, different attendance data) — was previously one month at a
    # time, so a 12-month report paid ~12x a single month's latency in pure
    # sequential wait. max_workers is capped below MAX_RANGE_MONTHS because
    # _all_summaries_for_month already opens its own 4-way pool per month;
    # running all 12 at once would mean up to 48 concurrent Supabase requests.
    with ThreadPoolExecutor(max_workers=4) as pool:
        month_summaries = list(
            pool.map(
                lambda ym: _all_summaries_for_month(employees, profiles_by_employee, holidays, ym[0], ym[1]),
                months,
            )
        )

    aggregated: dict[str, dict] = {}
    for summaries in month_summaries:
        for summary in summaries:
            agg = aggregated.get(summary["employee_id"])
            if agg is None:
                agg = {f: summary[f] for f in RANGE_CARRY_FIELDS}
                agg["employee_id"] = summary["employee_id"]
                agg["months_included"] = 0
                for f in RANGE_SUM_FIELDS:
                    agg[f] = 0
                aggregated[summary["employee_id"]] = agg
            agg["months_included"] += 1
            for f in RANGE_SUM_FIELDS:
                agg[f] = round(agg[f] + summary[f], 2)

    return list(aggregated.values())


@router.get("/payroll/{employee_id}")
def payroll_for_employee(
    employee_id: str,
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: dict = Depends(get_current_user),
):
    if user["id"] != employee_id:
        if user["role"] not in CONSOLE_ROLES or not user_can(user, "payroll.view"):
            raise HTTPException(status_code=403, detail="Not authorized")
    employee = _get_active_employee(employee_id)
    with ThreadPoolExecutor(max_workers=7) as pool:
        punches_future = pool.submit(_fetch_punch_times, employee["employee_code"], year, month)
        overrides_future = pool.submit(_fetch_overrides, employee_id, year, month)
        leaves_future = pool.submit(fetch_approved_leaves, employee_id, year, month)
        wfh_future = pool.submit(fetch_confirmed_wfh, employee_id, year, month)
        holidays_future = pool.submit(_fetch_holidays)
        pl_ledger_future = pool.submit(pl_ledger_for_period, employee, year, month)
        monthly_tds_future = pool.submit(_monthly_tds, employee, year, month)
        punches = punches_future.result()
        overrides = overrides_future.result()
        leaves = leaves_future.result()
        wfh_days = wfh_future.result()
        holidays = holidays_future.result()
        pl_ledger = pl_ledger_future.result()
        monthly_tds = monthly_tds_future.result()
    summary = compute_monthly_summary(
        employee, year, month, punches, overrides, leaves, holidays, monthly_tds, wfh_days=wfh_days,
    )
    summary["pl_ledger"] = pl_ledger
    return summary


MAX_ATTENDANCE_RANGE_DAYS = 366


def _attendance_for_range(employee: dict, from_date: date, to_date: date) -> list[dict]:
    if to_date < from_date:
        raise HTTPException(status_code=400, detail="'to' must be on or after 'from'")
    if (to_date - from_date).days + 1 > MAX_ATTENDANCE_RANGE_DAYS:
        raise HTTPException(status_code=400, detail=f"Range cannot exceed {MAX_ATTENDANCE_RANGE_DAYS} days")
    with ThreadPoolExecutor(max_workers=5) as pool:
        punches_future = pool.submit(_fetch_punch_times_range, employee["employee_code"], from_date, to_date)
        overrides_future = pool.submit(_fetch_overrides_range, employee["id"], from_date, to_date)
        leaves_future = pool.submit(fetch_approved_leaves, employee["id"], from_date.year, from_date.month, (from_date, to_date))
        wfh_future = pool.submit(fetch_confirmed_wfh, employee["id"], from_date.year, from_date.month, (from_date, to_date))
        holidays_future = pool.submit(_fetch_holidays)
        punches = punches_future.result()
        overrides = overrides_future.result()
        leaves = leaves_future.result()
        wfh_days = wfh_future.result()
        holidays = holidays_future.result()
    return compute_attendance_for_range(employee, from_date, to_date, punches, overrides, leaves, holidays, wfh_days=wfh_days)


@router.get("/attendance/{employee_id}")
def attendance_for_employee(
    employee_id: str,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    user: dict = Depends(get_current_user),
):
    if user["id"] != employee_id:
        if user["role"] not in CONSOLE_ROLES or not user_can(user, "payroll.view"):
            raise HTTPException(status_code=403, detail="Not authorized")
    employee = _get_active_employee(employee_id)
    return {"daily": _attendance_for_range(employee, from_date, to_date)}


@router.get("/me/attendance")
def my_attendance(
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    user: dict = Depends(get_current_user),
):
    employee = {**user, **_fetch_compliance_profile(user["id"])}
    return {"daily": _attendance_for_range(employee, from_date, to_date)}


@router.get("/me/payroll")
def my_payroll(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: dict = Depends(get_current_user),
):
    employee = {**user, **_fetch_compliance_profile(user["id"])}
    with ThreadPoolExecutor(max_workers=7) as pool:
        punches_future = pool.submit(_fetch_punch_times, employee["employee_code"], year, month)
        overrides_future = pool.submit(_fetch_overrides, employee["id"], year, month)
        leaves_future = pool.submit(fetch_approved_leaves, employee["id"], year, month)
        wfh_future = pool.submit(fetch_confirmed_wfh, employee["id"], year, month)
        holidays_future = pool.submit(_fetch_holidays)
        pl_ledger_future = pool.submit(pl_ledger_for_period, employee, year, month)
        monthly_tds_future = pool.submit(_monthly_tds, employee, year, month)
        punches = punches_future.result()
        overrides = overrides_future.result()
        leaves = leaves_future.result()
        wfh_days = wfh_future.result()
        holidays = holidays_future.result()
        pl_ledger = pl_ledger_future.result()
        monthly_tds = monthly_tds_future.result()
    summary = compute_monthly_summary(
        employee, year, month, punches, overrides, leaves, holidays, monthly_tds, wfh_days=wfh_days,
    )
    summary["pl_ledger"] = pl_ledger
    return summary
