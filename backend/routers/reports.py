from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import require_permission
from bonus import BONUS_MIN_RATE, compute_bonus
from database import maybe_single_data, supabase
from gratuity import compute_gratuity
from payroll import compute_monthly_summary, fy_month_labels, pay_period_bounds
from routers.leave import fetch_all_approved_leaves_by_employee, fetch_approved_leaves, paid_leave_balance_as_of
from routers.payroll import (
    _all_summaries_for_month, _fetch_all_compliance_profiles, _fetch_all_overrides_by_employee,
    _fetch_all_punches_by_employee, _fetch_holidays, _fetch_overrides, _fetch_punch_times,
)
from tds import DEFAULT_DECLARATION, project_annual_tax

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/ctc-as-per-salary")
def ctc_as_per_salary(
    as_of: date | None = Query(default=None),
    user: dict = Depends(require_permission("payroll.view")),
):
    """Each active employee's most recent hr_salary_structure row as of a
    given date — the CTC the Salary Structure editor already computed and
    snapshotted, not a recomputation. Contrast with the payslip-driven CTC
    (basic+hra+conveyance+other+bonus+retention+incentive+OT, annualized,
    plus employer PF/ESIC/LWF) that the "CTC As Per Payslip" report derives
    from actual monthly figures via /api/payroll/range."""
    as_of = as_of or date.today()
    with ThreadPoolExecutor(max_workers=2) as pool:
        employees_future = pool.submit(
            lambda: supabase.table("hr_employees")
            .select("id,employee_code,first_name,last_name,location").eq("is_active", True).execute().data
        )
        structures_future = pool.submit(
            lambda: supabase.table("hr_salary_structure")
            .select("employee_id,effective_date,ctc_monthly,ctc_yearly,net_salary,total_earnings")
            .lte("effective_date", as_of.isoformat())
            .order("effective_date", desc=True)
            .execute()
            .data
        )
        employees = employees_future.result()
        structures = structures_future.result()
    latest_by_employee = {}
    for s in structures:
        latest_by_employee.setdefault(s["employee_id"], s)

    rows = []
    for e in employees:
        latest = latest_by_employee.get(e["id"])
        rows.append({
            "employee_id": e["id"],
            "employee_code": e["employee_code"],
            "name": f"{e['first_name']} {e.get('last_name', '')}".strip(),
            "location": e.get("location", ""),
            "effective_date": latest["effective_date"] if latest else None,
            "ctc_monthly": latest["ctc_monthly"] if latest else 0,
            "ctc_yearly": latest["ctc_yearly"] if latest else 0,
            "net_salary": latest["net_salary"] if latest else 0,
            "total_earnings": latest["total_earnings"] if latest else 0,
            "has_structure": latest is not None,
        })
    return rows


@router.get("/arrears")
def arrear_details(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    user: dict = Depends(require_permission("payroll.view")),
):
    """Every Salary Structure revision that carries a non-zero arrear —
    arrears in this system are a one-off manual line item on a specific
    versioned structure (earn_arrear), not a recurring monthly figure."""
    query = (
        supabase.table("hr_salary_structure")
        .select("id,employee_id,effective_date,earn_arrear,earn_total_arr,salary_remarks")
        .neq("earn_arrear", 0)
    )
    if from_date:
        query = query.gte("effective_date", from_date.isoformat())
    if to_date:
        query = query.lte("effective_date", to_date.isoformat())
    rows = query.order("effective_date", desc=True).execute().data
    if not rows:
        return []

    employee_ids = list({r["employee_id"] for r in rows})
    employees = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,location")
        .in_("id", employee_ids)
        .execute()
        .data
    )
    employee_by_id = {e["id"]: e for e in employees}

    result = []
    for r in rows:
        e = employee_by_id.get(r["employee_id"])
        if not e:
            continue
        result.append({
            "employee_id": r["employee_id"],
            "employee_code": e["employee_code"],
            "name": f"{e['first_name']} {e.get('last_name', '')}".strip(),
            "location": e.get("location", ""),
            "effective_date": r["effective_date"],
            "arrear_amount": r["earn_arrear"],
            "total_arrear": r["earn_total_arr"],
            "remarks": r.get("salary_remarks", ""),
        })
    return result


@router.get("/full-and-final/employees")
def full_and_final_employees(user: dict = Depends(require_permission("payroll.view"))):
    """Every employee — active or exited — so a settlement can be previewed
    for anyone, not just those already marked as leaving. Exit-related
    fields are included so the picker can show status at a glance."""
    with ThreadPoolExecutor(max_workers=2) as pool:
        employees_future = pool.submit(
            lambda: supabase.table("hr_employees")
            .select("id,employee_code,first_name,last_name,location,is_active").execute().data
        )
        profiles_future = pool.submit(
            lambda: supabase.table("hr_employee_profile")
            .select("employee_id,exit_date,scheduled_exit_date,employee_status").execute().data
        )
        employees = employees_future.result()
        profiles = profiles_future.result()
    profile_by_id = {p["employee_id"]: p for p in profiles}
    rows = []
    for e in employees:
        p = profile_by_id.get(e["id"], {})
        rows.append({
            "employee_id": e["id"],
            "employee_code": e["employee_code"],
            "name": f"{e['first_name']} {e.get('last_name', '')}".strip(),
            "location": e.get("location", ""),
            "is_active": e.get("is_active"),
            "exit_date": p.get("exit_date"),
            "scheduled_exit_date": p.get("scheduled_exit_date"),
            "employee_status": p.get("employee_status"),
        })
    rows.sort(key=lambda r: r["name"])
    return rows


def _pay_period_for_date(d: date) -> tuple[int, int]:
    """Which (year, month) pay-period label a calendar date falls in —
    periods run 23rd(prev month) to 22nd(this month)."""
    if d.day <= 22:
        return d.year, d.month
    month, year = d.month + 1, d.year
    if month > 12:
        month, year = 1, year + 1
    return year, month


@router.get("/full-and-final/{employee_id}")
def full_and_final(employee_id: str, user: dict = Depends(require_permission("payroll.view"))):
    """Exit settlement: the employee's last pay-period payslip (pro-rated
    for whatever attendance/OT/deductions actually happened), unused
    earned-leave encashment, and gratuity (Payment of Gratuity Act, 1972 —
    see gratuity.py). Someone with no Exit Date or Scheduled Exit Date
    recorded gets an 'as of today' estimate (is_estimate=True) instead of a
    400 — mirrors how /api/reports/gratuity already treats active
    employees, and lets this be previewed before anyone has actually
    resigned."""
    with ThreadPoolExecutor(max_workers=2) as pool:
        employee_future = pool.submit(
            lambda: supabase.table("hr_employees").select("*").eq("id", employee_id).maybe_single().execute()
        )
        profile_future = pool.submit(
            lambda: supabase.table("hr_employee_profile")
            .select("*").eq("employee_id", employee_id).maybe_single().execute()
        )
        employee = maybe_single_data(employee_future.result())
        profile = maybe_single_data(profile_future.result()) or {}
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    merged = {**employee, **profile}

    exit_date_str = profile.get("exit_date") or profile.get("scheduled_exit_date")
    is_estimate = exit_date_str is None
    reference_date = date.fromisoformat(exit_date_str) if exit_date_str else date.today()
    period_year, period_month = _pay_period_for_date(reference_date)

    with ThreadPoolExecutor(max_workers=4) as pool:
        punches_future = pool.submit(_fetch_punch_times, employee["employee_code"], period_year, period_month)
        overrides_future = pool.submit(_fetch_overrides, employee_id, period_year, period_month)
        leaves_future = pool.submit(fetch_approved_leaves, employee_id, period_year, period_month)
        holidays_future = pool.submit(_fetch_holidays)
        punches = punches_future.result()
        overrides = overrides_future.result()
        leaves = leaves_future.result()
        holidays = holidays_future.result()
    last_payslip = compute_monthly_summary(merged, period_year, period_month, punches, overrides, leaves, holidays)

    leave_balance = paid_leave_balance_as_of(merged, reference_date)
    leave_encashment = round(leave_balance * last_payslip["per_day_salary"], 2)

    service_start_str = profile.get("gratuity_date") or employee.get("date_of_joining")
    gratuity = (
        compute_gratuity(
            float(employee.get("basic") or 0), date.fromisoformat(service_start_str), reference_date,
            waived_5yr_rule=profile.get("reason_of_leaving") in ("Death", "Disablement"),
        )
        if service_start_str
        else {"eligible": False, "years_of_service": 0, "gratuity_amount": 0.0, "capped": False}
    )

    total_settlement = round(last_payslip["total_payable"] + leave_encashment + gratuity["gratuity_amount"], 2)

    return {
        "employee_id": employee_id,
        "employee_code": employee["employee_code"],
        "name": f"{employee['first_name']} {employee.get('last_name', '')}".strip(),
        "location": employee.get("location", ""),
        "exit_date": exit_date_str,
        "reference_date": reference_date.isoformat(),
        "is_estimate": is_estimate,
        "employee_status": profile.get("employee_status"),
        "reason_of_leaving": profile.get("reason_of_leaving"),
        "period_year": period_year,
        "period_month": period_month,
        "last_payslip_net": last_payslip["total_payable"],
        "per_day_salary": last_payslip["per_day_salary"],
        "leave_balance_days": leave_balance,
        "leave_encashment": leave_encashment,
        "gratuity": gratuity,
        "total_settlement": total_settlement,
    }


@router.get("/tds-projection")
def tds_projection_report(financial_year: str = Query(...), user: dict = Depends(require_permission("payroll.view"))):
    with ThreadPoolExecutor(max_workers=2) as pool:
        employees_future = pool.submit(
            lambda: supabase.table("hr_employees").select("*").eq("is_active", True).execute().data
        )
        decl_future = pool.submit(
            lambda: supabase.table("hr_tax_declarations").select("*").eq("financial_year", financial_year).execute()
        )
        employees = employees_future.result()
        decl_resp = decl_future.result()
    declarations = {d["employee_id"]: d for d in decl_resp.data}
    today = date.today()
    results = []
    for emp in employees:
        declaration = declarations.get(emp["id"]) or DEFAULT_DECLARATION
        projection = project_annual_tax(emp, financial_year, declaration, today.year, today.month)
        results.append({
            "employee_id": emp["id"], "employee_code": emp["employee_code"],
            "name": f"{emp['first_name']} {emp.get('last_name', '')}".strip(),
            "location": emp.get("location"), "department": emp.get("department"),
            **projection,
        })
    return results


def _month_bonus_contributions(y: int, m: int, employees: list[dict], holidays: dict[date, dict]) -> dict[str, tuple[float, float]]:
    """One FY month's (paid_days, basic_wage) contribution per eligible
    employee — the 3 bulk fetches below are independent (different tables),
    same pattern as _all_summaries_for_month."""
    with ThreadPoolExecutor(max_workers=3) as pool:
        punches_future = pool.submit(_fetch_all_punches_by_employee, y, m)
        overrides_future = pool.submit(_fetch_all_overrides_by_employee, y, m)
        leaves_future = pool.submit(fetch_all_approved_leaves_by_employee, y, m)
        punches_by_employee = punches_future.result()
        overrides_by_employee = overrides_future.result()
        leaves_by_employee = leaves_future.result()

    _, period_end = pay_period_bounds(y, m)
    contributions: dict[str, tuple[float, float]] = {}
    for emp in employees:
        doj = emp.get("date_of_joining")
        if doj and period_end < date.fromisoformat(doj):
            continue
        punches = punches_by_employee.get(emp["employee_code"], [])
        overrides = overrides_by_employee.get(emp["id"], {})
        leaves = leaves_by_employee.get(emp["id"], {})
        summary = compute_monthly_summary(emp, y, m, punches, overrides, leaves, holidays)
        contributions[emp["id"]] = (summary["paid_days"], summary["basic"])
    return contributions


@router.get("/bonus")
def bonus_report(
    financial_year: str = Query(...),
    rate: float = Query(BONUS_MIN_RATE),
    user: dict = Depends(require_permission("payroll.view")),
):
    """Payment of Bonus Act, 1965 — one row per active employee for the given
    accounting year (treated as JADE's April-March financial year). 'Days
    worked' sums the same paid_days figure the payslip itself uses (present +
    weekoff + holiday + privilege leave), per Sec 14's broad definition of a
    working day, over only the FY months the employee was actually employed
    (bounded by Date of Joining) — bulk-fetched one month at a time, mirroring
    /api/payroll's own bulk-fetch pattern, rather than one query per employee.

    `monthly_wages` (keyed by calendar month number 1-12, each appearing
    exactly once across an Apr-Mar FY) is each month's actual prorated Basic
    — the per-month columns on the Bonus sheet — and their sum is the
    uncapped calculation base compute_bonus uses (see bonus.py docstring)."""
    employees = supabase.table("hr_employees").select("*").eq("is_active", True).execute().data
    holidays = _fetch_holidays()
    month_labels = fy_month_labels(financial_year)
    paid_days_by_employee: dict[str, float] = defaultdict(float)
    months_by_employee: dict[str, int] = defaultdict(int)
    monthly_wage_by_employee: dict[str, dict[int, float]] = defaultdict(lambda: {m: 0.0 for (_, m) in month_labels})

    # Each FY month is an independent bulk fetch+compute — was previously one
    # month at a time, so a full-year report paid ~12x a single month's wait.
    # Capped at 4 concurrent months since each month itself opens its own
    # 3-way pool above, mirroring payroll_for_range's identical tradeoff.
    with ThreadPoolExecutor(max_workers=4) as pool:
        month_contributions = list(
            pool.map(lambda ym: _month_bonus_contributions(ym[0], ym[1], employees, holidays), month_labels)
        )
    for (y, m), contributions in zip(month_labels, month_contributions):
        for emp_id, (paid_days, basic_wage) in contributions.items():
            paid_days_by_employee[emp_id] += paid_days
            months_by_employee[emp_id] += 1
            monthly_wage_by_employee[emp_id][m] += basic_wage

    results = []
    for emp in employees:
        months = months_by_employee.get(emp["id"], 0)
        if months == 0:
            continue
        wage_by_month = monthly_wage_by_employee[emp["id"]]
        basic_wage_sum = sum(wage_by_month.values())
        bonus = compute_bonus(float(emp.get("basic") or 0), basic_wage_sum, paid_days_by_employee[emp["id"]], rate)
        results.append({
            "employee_id": emp["id"], "employee_code": emp["employee_code"],
            "name": f"{emp['first_name']} {emp.get('last_name', '')}".strip(),
            "location": emp.get("location"), "department": emp.get("department"),
            "months_employed": months, "days_worked": round(paid_days_by_employee[emp["id"]], 1),
            "monthly_wages": {m: round(w, 2) for m, w in wage_by_month.items()},
            "salary_amount": round(basic_wage_sum, 2),
            # Ex-gratia — a discretionary goodwill payment (typically for
            # employees above the eligibility ceiling), with no statutory
            # formula. Always 0 here; not yet an editable/persisted figure.
            "exgratia_amount": 0,
            **bonus,
        })
    return results


@router.get("/attendance")
def attendance_report(
    year: int = Query(...),
    month: int = Query(..., ge=1, le=12),
    user: dict = Depends(require_permission("payroll.view", "attendance.view")),
):
    """Full pay-period daily attendance grid, every active employee — the
    same per-day rows the payslip's own daily breakdown uses (see
    payroll.py's compute_daily_attendance), just not dropped before return
    the way the bulk /api/payroll response is (keep_daily=True)."""
    with ThreadPoolExecutor(max_workers=3) as pool:
        employees_future = pool.submit(
            lambda: supabase.table("hr_employees").select("*").eq("is_active", True).execute().data
        )
        profiles_future = pool.submit(_fetch_all_compliance_profiles)
        holidays_future = pool.submit(_fetch_holidays)
        employees = employees_future.result()
        profiles_by_employee = profiles_future.result()
        holidays = holidays_future.result()
    summaries = _all_summaries_for_month(employees, profiles_by_employee, holidays, year, month, keep_daily=True)
    return [
        {
            "employee_id": s["employee_id"],
            "employee_code": s["employee_code"],
            "name": s["name"],
            "location": s["location"],
            "department": s["department"],
            "daily": s["daily"],
        }
        for s in summaries
    ]


@router.get("/gratuity")
def gratuity_report(as_of: date | None = Query(None), user: dict = Depends(require_permission("payroll.view"))):
    """Payment of Gratuity Act, 1972. Includes every employee (active AND
    soft-deleted/exited, since gratuity may still be owed after separation) —
    for an active employee this is an 'if they left today' provisioning
    estimate off their CURRENT Basic; for someone with an exit_date recorded,
    it's evaluated as of that date instead. Death/Disablement in
    reason_of_leaving waives the 5-year rule per Sec 4(1)'s proviso."""
    as_of = as_of or date.today()
    with ThreadPoolExecutor(max_workers=2) as pool:
        employees_future = pool.submit(lambda: supabase.table("hr_employees").select("*").execute().data)
        profile_future = pool.submit(
            lambda: supabase.table("hr_employee_profile")
            .select("employee_id,gratuity_date,exit_date,reason_of_leaving,employee_status").execute()
        )
        employees = employees_future.result()
        profile_resp = profile_future.result()
    profiles = {p["employee_id"]: p for p in profile_resp.data}

    results = []
    for emp in employees:
        profile = profiles.get(emp["id"], {})
        service_start_str = profile.get("gratuity_date") or emp.get("date_of_joining")
        if not service_start_str:
            continue
        service_start = date.fromisoformat(service_start_str)
        reference_date = date.fromisoformat(profile["exit_date"]) if profile.get("exit_date") else as_of
        waived = profile.get("reason_of_leaving") in ("Death", "Disablement")
        gratuity = compute_gratuity(float(emp.get("basic") or 0), service_start, reference_date, waived)
        results.append({
            "employee_id": emp["id"], "employee_code": emp["employee_code"],
            "name": f"{emp['first_name']} {emp.get('last_name', '')}".strip(),
            "location": emp.get("location"), "department": emp.get("department"),
            "is_active": emp.get("is_active"), "service_start": service_start.isoformat(),
            "reference_date": reference_date.isoformat(),
            **gratuity,
        })
    return results
