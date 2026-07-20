from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import CONSOLE_ROLES, get_current_user, require_permission, user_can
from config import IST
from database import maybe_single_data, supabase
from payroll import compute_monthly_summary, fy_label_for_month, pay_period_bounds
from routers.leave import (
    fetch_all_approved_leaves_by_employee, fetch_approved_leaves, pl_ledger_for_period, pl_ledger_for_period_bulk,
)
from tds import DEFAULT_DECLARATION, project_annual_tax

router = APIRouter(prefix="/api", tags=["payroll"])


def _month_bounds(year: int, month: int) -> tuple[str, str]:
    """Pay-period bounds (23rd of prior month - 22nd of this month), as UTC
    instants — the period is defined in IST wall-clock time, so midnight IST
    on each boundary date is what actually delimits it."""
    start, end = pay_period_bounds(year, month)
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


def _fetch_all_punches_by_employee(year: int, month: int) -> dict[str, list[datetime]]:
    """One (paginated) query for the whole month instead of one query per employee."""
    from_dt, to_dt = _month_bounds(year, month)
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


def _fetch_overrides(employee_id: str, year: int, month: int) -> dict[date, dict]:
    start, end = pay_period_bounds(year, month)
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


def _fetch_all_overrides_by_employee(year: int, month: int) -> dict[str, dict[date, dict]]:
    start, end = pay_period_bounds(year, month)
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
    year: int, month: int, keep_daily: bool = False,
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
    with ThreadPoolExecutor(max_workers=4) as pool:
        punches_future = pool.submit(_fetch_all_punches_by_employee, year, month)
        overrides_future = pool.submit(_fetch_all_overrides_by_employee, year, month)
        leaves_future = pool.submit(fetch_all_approved_leaves_by_employee, year, month)
        declarations_future = pool.submit(_fetch_all_tax_declarations, fy_label_for_month(year, month))
        punches_by_employee = punches_future.result()
        overrides_by_employee = overrides_future.result()
        leaves_by_employee = leaves_future.result()
        declarations_by_employee = declarations_future.result()
    summaries = []
    for employee in employees:
        employee = {**employee, **profiles_by_employee.get(employee["id"], {})}
        punches = punches_by_employee.get(employee["employee_code"], [])
        overrides = overrides_by_employee.get(employee["id"], {})
        leaves = leaves_by_employee.get(employee["id"], {})
        # Bulk path: a missing entry means "no declaration saved", not "go
        # fetch it individually" — must never fall through to _monthly_tds's
        # per-employee DB query, or this reintroduces an N+1 for every
        # employee who hasn't filled in a declaration yet.
        declaration = declarations_by_employee.get(employee["id"]) or DEFAULT_DECLARATION
        monthly_tds = _monthly_tds(employee, year, month, declaration)
        summary = compute_monthly_summary(employee, year, month, punches, overrides, leaves, holidays, monthly_tds)
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
    with ThreadPoolExecutor(max_workers=6) as pool:
        punches_future = pool.submit(_fetch_punch_times, employee["employee_code"], year, month)
        overrides_future = pool.submit(_fetch_overrides, employee_id, year, month)
        leaves_future = pool.submit(fetch_approved_leaves, employee_id, year, month)
        holidays_future = pool.submit(_fetch_holidays)
        pl_ledger_future = pool.submit(pl_ledger_for_period, employee, year, month)
        monthly_tds_future = pool.submit(_monthly_tds, employee, year, month)
        punches = punches_future.result()
        overrides = overrides_future.result()
        leaves = leaves_future.result()
        holidays = holidays_future.result()
        pl_ledger = pl_ledger_future.result()
        monthly_tds = monthly_tds_future.result()
    summary = compute_monthly_summary(employee, year, month, punches, overrides, leaves, holidays, monthly_tds)
    summary["pl_ledger"] = pl_ledger
    return summary


@router.get("/me/payroll")
def my_payroll(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: dict = Depends(get_current_user),
):
    employee = {**user, **_fetch_compliance_profile(user["id"])}
    with ThreadPoolExecutor(max_workers=6) as pool:
        punches_future = pool.submit(_fetch_punch_times, employee["employee_code"], year, month)
        overrides_future = pool.submit(_fetch_overrides, employee["id"], year, month)
        leaves_future = pool.submit(fetch_approved_leaves, employee["id"], year, month)
        holidays_future = pool.submit(_fetch_holidays)
        pl_ledger_future = pool.submit(pl_ledger_for_period, employee, year, month)
        monthly_tds_future = pool.submit(_monthly_tds, employee, year, month)
        punches = punches_future.result()
        overrides = overrides_future.result()
        leaves = leaves_future.result()
        holidays = holidays_future.result()
        pl_ledger = pl_ledger_future.result()
        monthly_tds = monthly_tds_future.result()
    summary = compute_monthly_summary(employee, year, month, punches, overrides, leaves, holidays, monthly_tds)
    summary["pl_ledger"] = pl_ledger
    return summary
