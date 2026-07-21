"""OT / attendance calculation engine.

Pay periods run from the 23rd of the prior month through the 22nd of the
period's own month (e.g. "July 2026" = 23 Jun 2026 - 22 Jul 2026) — not
calendar months. The (year, month) pair labels a period by its END date.

Formula (as specified by JADE HR ops), example — Sarita:
    Basic = 16,000, HRA = 9,600, Conveyance = 1,200 -> Total = 26,800
    Days in Period = 31
    Per Day Salary  = 26,800 / 31   = 864.51
    Per Hour Salary = 864.51 / 8    = 108.06
    Total OT Hours  = 21.54
    OT Amount = 108.06 x 21.54 = 2,328 (approx)
"""

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from config import IST
from statutory import ZERO_ESIC, ZERO_PF, compute_esic, compute_lwf, compute_pf, compute_pt, location_to_state

# Grace period: clocking in by 10:11 AM IST counts as on time.
LATE_GRACE = time(10, 11)

# Stay-back policy (revised Jul 2026): a late FINISH the prior day earns a
# later grace THE FOLLOWING day — mutually exclusive tiers by how late the
# prior day's shift actually ran (each is a distinct clock-time zone, not
# cumulative). A finish past midnight does NOT extend next-day grace — it
# earns a comp-off instead (see MIDNIGHT_TAIL_CUTOFF / _midnight_crossing_dates).
STAY_BACK_TIER_1_CUTOFF = time(20, 30)  # past 8:30 PM
STAY_BACK_TIER_2_CUTOFF = time(22, 30)  # past 10:30 PM
STAY_BACK_TIER_1_GRACE = time(11, 0)
STAY_BACK_TIER_2_GRACE = time(12, 0)
# Punches are bucketed by IST calendar date (group_punches_by_day), not by
# shift — a clock-out after midnight lands in the NEXT day's bucket instead
# of staying attached to the shift that earned it. A first punch before this
# hour is never a genuine fresh arrival for this company's shifts (earliest
# is 10 AM) — it's the tail of the PRIOR day's overnight finish.
MIDNIGHT_TAIL_CUTOFF = time(6, 0)

# Employees on this time_slot (hr_employee_profile.time_slot) get a shortened
# Saturday — 10:00 AM - 3:00 PM (5h) — instead of their usual weekday
# standard_hours_per_day, per JADE HR's Jul 2026 Saturday-hours change. This
# still governs the late-coming/LOP policy's "completed the day's prescribed
# hours" check below — OT itself no longer uses it (see SATURDAY_OT_CUTOFF).
SATURDAY_SHIFT_HOURS = {
    "10:00 AM – 6:30 PM": 5.0,
}

# Company-wide Jul 2026 policy: on Saturdays, every employee's standard time
# runs until 3:00 PM IST regardless of time_slot — only hours actually worked
# with a clock time past this count as OT, not just hours in excess of some
# threshold (so a late Saturday arrival who works past 3pm still earns OT for
# that portion, and one who leaves before 3pm earns none regardless of when
# they arrived).
SATURDAY_OT_CUTOFF = time(15, 0)


def _standard_hours_for_day(d: date, standard_hours_per_day: float, time_slot: str | None) -> float:
    if d.weekday() == 5 and time_slot in SATURDAY_SHIFT_HOURS:
        return SATURDAY_SHIFT_HOURS[time_slot]
    return standard_hours_per_day


def _ot_hours(d: date, start: datetime, end: datetime, day_standard: float) -> float:
    """OT for one worked span. Saturdays use the fixed 3pm clock cutoff
    above for every employee; every other day is hours worked beyond that
    day's standard (day_standard — Saturday-shortened for the late-coming
    policy's own purposes, but irrelevant to OT now)."""
    if d.weekday() == 5:
        cutoff = datetime.combine(d, SATURDAY_OT_CUTOFF, tzinfo=IST)
        return max(0.0, (end - max(start, cutoff)).total_seconds() / 3600.0)
    hours_worked = max(0.0, (end - start).total_seconds() / 3600.0)
    return max(0.0, hours_worked - day_standard)


def pay_period_bounds(year: int, month: int) -> tuple[date, date]:
    """Pay period labeled (year, month) runs 23rd of the prior month
    through the 22nd of (year, month)."""
    if month == 1:
        prev_year, prev_month = year - 1, 12
    else:
        prev_year, prev_month = year, month - 1
    start = date(prev_year, prev_month, 23)
    end = date(year, month, 22)
    return start, end


def days_in_month(year: int, month: int) -> int:
    """Number of days in the pay period. Name kept for call-site compatibility."""
    start, end = pay_period_bounds(year, month)
    return (end - start).days + 1


def group_punches_by_day(punch_times: list[datetime]) -> dict[date, list[datetime]]:
    """Groups by IST calendar date. Punches are stored as true UTC instants,
    but the attendance "day" boundary is local Indian midnight, not UTC —
    grouping by UTC date would misfile any punch in the ~5.5hr IST/UTC gap."""
    by_day: dict[date, list[datetime]] = defaultdict(list)
    for pt in punch_times:
        by_day[pt.astimezone(IST).date()].append(pt)
    for day_punches in by_day.values():
        day_punches.sort()
    return by_day


def _holiday_applies(holiday_location: str | None, employee_location: str | None) -> bool:
    """None = applies everywhere. "HQ" = Madhu Estate, Mumbai specifically
    (head office, distinct from JADE's other Mumbai store). Anything else
    is a city name, fuzzy-matched the same way statutory.py's
    location_to_state does (hr_employees.location isn't DB-constrained to
    a fixed list, so exact-match would silently miss real store names)."""
    if not holiday_location:
        return True
    if holiday_location == "HQ":
        return employee_location == "Madhu Estate, Mumbai"
    return holiday_location.lower() in (employee_location or "").lower()


def _holidays_for_employee(all_holidays: list[dict], employee_location: str | None) -> dict[date, dict]:
    """Resolves the location-tagged holiday rows down to the single
    dict[date, dict] compute_daily_attendance expects, for one employee.
    Sorted so a more specific match (HQ, then a named city) overwrites a
    company-wide (location=None) row for the same date, if both exist."""
    specificity = {None: 0, "HQ": 2}
    ordered = sorted(all_holidays, key=lambda h: specificity.get(h.get("location"), 1))
    return {
        date.fromisoformat(h["holiday_date"]): h
        for h in ordered
        if _holiday_applies(h.get("location"), employee_location)
    }


def _apply_override(d: date, override: dict, standard_hours_per_day: float, time_slot: str | None = None) -> dict:
    status = override["status_override"]
    first_in, last_out = override.get("first_in"), override.get("last_out")
    day_standard = _standard_hours_for_day(d, standard_hours_per_day, time_slot)

    hours_worked = ot_hours = 0.0
    first_in_iso = last_out_iso = None
    late = False
    if status == "present" and first_in and last_out:
        start = datetime.combine(d, first_in, tzinfo=IST)
        end = datetime.combine(d, last_out, tzinfo=IST)
        hours_worked = max(0.0, (end - start).total_seconds() / 3600.0)
        ot_hours = _ot_hours(d, start, end, day_standard)
        first_in_iso, last_out_iso = start.isoformat(), end.isoformat()
        late = first_in > LATE_GRACE
    elif status == "present":
        hours_worked = day_standard
    elif status == "half_day":
        hours_worked = day_standard / 2

    return {
        "date": d.isoformat(),
        "first_in": first_in_iso,
        "last_out": last_out_iso,
        "hours_worked": round(hours_worked, 2),
        "ot_hours": round(ot_hours, 2),
        "status": status,
        "late": late,
        "corrected": True,
    }


def _midnight_crossing_dates(by_day: dict[date, list[datetime]]) -> set[date]:
    """Dates whose shift extended past midnight into the next calendar
    date's punch bucket — detected via the NEXT day's first punch landing
    implausibly early (before MIDNIGHT_TAIL_CUTOFF), since punches are
    grouped by IST calendar date, not by shift (see that constant's own
    comment). Comp-off eligible; does not extend the next day's late grace."""
    result = set()
    for d, punches in by_day.items():
        if punches and punches[0].astimezone(IST).time() < MIDNIGHT_TAIL_CUTOFF:
            result.add(d - timedelta(days=1))
    return result


def _extended_grace_for(d: date, by_day: dict[date, list[datetime]], midnight_tail_dates: set[date]) -> time:
    """Late-grace cutoff for day `d`, extended if the PRIOR calendar day's
    shift ran late enough to earn it (stay-back policy above). A prior day
    in midnight_tail_dates earns a comp-off instead of extended grace here
    — falls through to the normal LATE_GRACE."""
    prior = d - timedelta(days=1)
    if prior in midnight_tail_dates:
        return LATE_GRACE
    prior_punches = by_day.get(prior, [])
    if not prior_punches:
        return LATE_GRACE
    prior_last = prior_punches[-1].astimezone(IST).time()
    if prior_last > STAY_BACK_TIER_2_CUTOFF:
        return STAY_BACK_TIER_2_GRACE
    if prior_last > STAY_BACK_TIER_1_CUTOFF:
        return STAY_BACK_TIER_1_GRACE
    return LATE_GRACE


NOON = time(12, 0)


def compute_daily_attendance(
    year: int,
    month: int,
    punch_times: list[datetime],
    standard_hours_per_day: float,
    overrides: dict[date, dict] | None = None,
    leaves: dict[date, str] | None = None,
    weekly_off_day: int = 6,
    holidays: dict[date, dict] | None = None,
    is_corporate: bool = False,
    time_slot: str | None = None,
) -> list[dict]:
    """One row per day in the pay period (23rd of prior month - 22nd of this month).

    `overrides` (keyed by date) are admin-approved corrections — e.g. from an
    employee's "I forgot to punch out" dispute — and take priority over raw
    punch data for that day. `leaves` (date -> leave_type) are approved leave
    requests; a day with no punches falls back to "leave" instead of "absent"
    when one covers it. `weekly_off_day` follows date.weekday() (0=Mon..6=Sun,
    default Sunday) and is set per-employee for staff with a rotational off.

    `holidays` and `is_corporate` implement the corporate-roster-only Leave &
    Attendance Policy v1.1: a 'closed' company holiday is paid like a weekoff
    instead of showing absent, and a present day landing on a weekoff/closed
    holiday is flagged comp-off eligible — as is one where the PRIOR day's
    shift ran past midnight (see MIDNIGHT_TAIL_CUTOFF; a same-day-but-late
    finish instead extends THIS day's late grace — see
    STAY_BACK_TIER_1/2_CUTOFF — mutually exclusive with the comp-off case).
    Late-mark/Red-Card/LOP-by-lateness is cross-day cycle state, computed in
    compute_monthly_summary instead.
    """
    overrides = overrides or {}
    leaves = leaves or {}
    holidays = holidays or {}
    by_day = group_punches_by_day(punch_times)
    midnight_tail_dates = _midnight_crossing_dates(by_day)
    start, end = pay_period_bounds(year, month)
    today = datetime.now(IST).date()

    rows = []
    d = start
    while d <= end:
        if d in overrides:
            rows.append(_apply_override(d, overrides[d], standard_hours_per_day, time_slot))
            d += timedelta(days=1)
            continue

        punches = by_day.get(d, [])
        # A first punch before MIDNIGHT_TAIL_CUTOFF isn't a fresh arrival —
        # it's the tail of YESTERDAY's shift, misfiled into today's bucket
        # by pure calendar-date grouping. Drop it so it can't masquerade as
        # today's first_in (and, e.g., zero out today's hours_worked).
        if punches and punches[0].astimezone(IST).time() < MIDNIGHT_TAIL_CUTOFF:
            punches = punches[1:]
        is_closed_holiday = is_corporate and holidays.get(d, {}).get("day_type") in ("closed", "day_off")

        if not punches:
            if d in leaves:
                rows.append({
                    "date": d.isoformat(),
                    "first_in": None,
                    "last_out": None,
                    "hours_worked": 0.0,
                    "ot_hours": 0.0,
                    "status": "leave",
                    "leave_type": leaves[d],
                    "late": False,
                })
                d += timedelta(days=1)
                continue
            if d > today:
                status = "future"
            elif is_closed_holiday:
                status = "holiday"
            elif d.weekday() == weekly_off_day:
                status = "weekoff"
            else:
                status = "absent"
            row = {
                "date": d.isoformat(),
                "first_in": None,
                "last_out": None,
                "hours_worked": 0.0,
                "ot_hours": 0.0,
                "status": status,
                "late": False,
            }
            if status == "holiday":
                row["holiday_description"] = holidays[d]["description"]
            rows.append(row)
            d += timedelta(days=1)
            continue

        first_in = punches[0]
        last_out = punches[-1]
        day_standard = _standard_hours_for_day(d, standard_hours_per_day, time_slot)
        hours_worked = max(0.0, (last_out - first_in).total_seconds() / 3600.0)
        ot_hours = _ot_hours(d, first_in, last_out, day_standard)
        first_in_local = first_in.astimezone(IST).time()

        row = {
            "date": d.isoformat(),
            "first_in": first_in.isoformat(),
            "last_out": last_out.isoformat(),
            "hours_worked": round(hours_worked, 2),
            "ot_hours": round(ot_hours, 2),
            "status": "present",
            "late": first_in_local > _extended_grace_for(d, by_day, midnight_tail_dates),
        }
        if is_corporate:
            row["after_noon"] = first_in_local > NOON
            if d.weekday() == weekly_off_day or is_closed_holiday:
                row["comp_off_eligible"] = True
                row["comp_off_units"] = 0.5 if hours_worked <= 4 else 1.0
            elif d in midnight_tail_dates:
                # Stayed back past midnight — comp-off eligible (stay-back
                # policy above), distinct from the weekoff/holiday comp-off
                # case above (mutually exclusive: this branch only reachable
                # when neither of those applied). hours_worked here can't be
                # trusted as a completeness measure — the true finish time
                # lives in TOMORROW's punch bucket (see MIDNIGHT_TAIL_CUTOFF),
                # not today's — so this always suggests a full day, not the
                # <=4h/>4h split the weekoff/holiday case uses.
                row["comp_off_eligible"] = True
                row["comp_off_units"] = 1.0
                row["midnight_comp_off"] = True
        rows.append(row)
        d += timedelta(days=1)

    return rows


LATE_FREE_COUNT = 2  # first N late arrivals in a cycle are free
LATE_LOP_DAYS = 0.25  # flat rate for every late arrival beyond the free count


def apply_late_coming_policy(
    daily: list[dict], standard_hours_per_day: float, time_slot: str | None = None
) -> tuple[int, bool]:
    """Corporate-roster-only (Leave & Attendance Policy, revised Jul 2026):
    the first LATE_FREE_COUNT late arrivals in the cycle are free; every late
    arrival beyond that costs a flat LATE_LOP_DAYS (0.25 day), regardless of
    how late it is or how many hours were worked that day — there is no longer
    a steeper tier for after-noon or short-hours arrivals. 5+ late marks in the
    cycle is a Red Card: any leave day not already admin-corrected becomes
    LOP too (a documented medical emergency or other management exception is
    a manual call — use the existing attendance-override mechanism to
    restore a specific day, or the admin Leave Entry page to bypass the
    Red Card leave-request block elsewhere).

    `standard_hours_per_day`/`time_slot` are retained for call-site
    compatibility (the shortfall check that used them was removed with the
    flat-rate change) — kept so the two callers don't have to change.

    Mutates `daily` in place (tags lop_days / red_card_lop) and returns
    (late_mark_count, red_card).
    """
    late_ordinal = 0
    for r in daily:
        if r["status"] == "present" and r.get("late"):
            late_ordinal += 1
            if late_ordinal > LATE_FREE_COUNT:
                r["lop_days"] = LATE_LOP_DAYS

    red_card = late_ordinal >= 5
    if red_card:
        for r in daily:
            if r["status"] == "leave" and r.get("leave_type") != "unpaid" and not r.get("corrected"):
                r["red_card_lop"] = True

    return late_ordinal, red_card


def fy_label_for_month(year: int, month: int) -> str:
    """India's financial year runs April-March; e.g. (2026, 7) and (2027, 2)
    both fall in FY '2026-27'. Mirrors the tds/bonus/gratuity modules'
    'financial_year' convention."""
    start_year = year if month >= 4 else year - 1
    return f"{start_year}-{str(start_year + 1)[2:]}"


def fy_month_labels(financial_year: str) -> list[tuple[int, int]]:
    """financial_year like '2026-27' -> the 12 pay-period (year,month) labels
    from April through March."""
    start_year = int(financial_year.split("-")[0])
    end_year = start_year + 1
    return [(start_year, m) for m in range(4, 13)] + [(end_year, m) for m in range(1, 4)]


def applicable_fy_months(employee: dict, financial_year: str) -> list[tuple[int, int]]:
    """FY month labels this employee actually draws salary for — bounded by
    Date of Joining (a label's pay period must end on/after DOJ) and, if
    known, an exit date (a label's pay period must start on/before it)."""
    labels = fy_month_labels(financial_year)
    doj = employee.get("date_of_joining")
    doj_date = date.fromisoformat(doj) if doj else None
    exit_str = employee.get("exit_date")
    exit_date = date.fromisoformat(exit_str) if exit_str else None
    result = []
    for (y, m) in labels:
        start, end = pay_period_bounds(y, m)
        if doj_date and end < doj_date:
            continue
        if exit_date and start > exit_date:
            continue
        result.append((y, m))
    return result


def compute_monthly_summary(
    employee: dict,
    year: int,
    month: int,
    punch_times: list[datetime],
    overrides: dict[date, dict] | None = None,
    leaves: dict[date, str] | None = None,
    holidays: list[dict] | None = None,
    monthly_tds: float = 0.0,
) -> dict:
    standard_hours = float(employee.get("standard_hours_per_day") or 8)
    weekly_off_day = int(employee.get("weekly_off_day") if employee.get("weekly_off_day") is not None else 6)
    is_corporate = employee.get("employee_category") == "corporate"
    time_slot = employee.get("time_slot")
    # Anniversaries are informational only — never a closure/early-close
    # day, so they must never affect attendance/OT/pay.
    holidays = [h for h in (holidays or []) if h.get("day_type") != "anniversary"]
    holidays_for_employee = _holidays_for_employee(holidays, employee.get("location"))
    daily = compute_daily_attendance(
        year, month, punch_times, standard_hours, overrides, leaves, weekly_off_day,
        holidays=holidays_for_employee, is_corporate=is_corporate, time_slot=time_slot,
    )

    late_mark_count, red_card = (
        apply_late_coming_policy(daily, standard_hours, time_slot) if is_corporate else (0, False)
    )

    present_days = sum(1 for r in daily if r["status"] == "present")
    absent_days = sum(1 for r in daily if r["status"] == "absent")
    holiday_days = sum(1 for r in daily if r["status"] == "holiday")
    leave_days = sum(1 for r in daily if r["status"] == "leave")
    weekoff_days = sum(1 for r in daily if r["status"] == "weekoff")
    half_days = sum(1 for r in daily if r["status"] == "half_day")
    unpaid_leave_days = sum(1 for r in daily if r["status"] == "leave" and r.get("leave_type") == "unpaid")
    red_card_lop_leave_days = sum(1 for r in daily if r.get("red_card_lop"))
    late_lop_days = round(sum(r.get("lop_days", 0) for r in daily), 2)
    pl_days = leave_days - unpaid_leave_days - red_card_lop_leave_days
    paid_days = present_days + weekoff_days + holiday_days + pl_days + 0.5 * half_days - late_lop_days
    # Payslip "WithoutPayDays" — the complement of paid_days over total_days:
    # full absences, unpaid/red-card-lop leave (excluded from pl_days above),
    # the unpaid halves of half-days, and late-coming LOP days (already a
    # day-amount, not a count — see LATE_LOP_DAYS/AFTER_NOON_OR_SHORTFALL_LOP_DAYS).
    without_pay_days = absent_days + unpaid_leave_days + red_card_lop_leave_days + 0.5 * half_days + late_lop_days
    late_days = sum(1 for r in daily if r["status"] == "present" and r.get("late"))
    on_time_days = present_days - late_days
    total_hours_worked = round(sum(r["hours_worked"] for r in daily), 2)
    total_ot_hours = round(sum(r["ot_hours"] for r in daily), 2)

    # "Rate" = the employee's full monthly figure (hr_employees.basic etc,
    # unprorated) — used as-is for the OT per-day/per-hour divisor (OT is a
    # top-up on top of a full month's rate, not the prorated actual). The
    # plain (non-"_rate") names below are what's actually earned/paid this
    # period: the rate scaled by attendance (paid_days ÷ days in the pay
    # period), matching how Accounts' own salary register prorates Basic/
    # HRA/Conveyance/Other Allowance/Incentive for partial-attendance months.
    basic_rate = float(employee.get("basic") or 0)
    hra_rate = float(employee.get("hra") or 0)
    conveyance_rate = float(employee.get("conveyance") or 0)
    other_allowance_rate = float(employee.get("other_allowance") or 0)
    monthly_bonus_rate = float(employee.get("monthly_bonus") or 0)
    retention_rate = float(employee.get("retention") or 0)
    incentive_rate = float(employee.get("incentive") or 0)
    # A fixed monthly EMI, deducted in full regardless of attendance —
    # unlike Basic/HRA/etc above, never prorated by paid_days.
    ded_standing_loan = round(float(employee.get("standing_loan_emi") or 0), 2)

    total_days = days_in_month(year, month)
    proration = paid_days / total_days if total_days else 0.0
    basic = round(basic_rate * proration, 2)
    hra = round(hra_rate * proration, 2)
    conveyance = round(conveyance_rate * proration, 2)
    other_allowance = round(other_allowance_rate * proration, 2)
    monthly_bonus = round(monthly_bonus_rate * proration, 2)
    retention = round(retention_rate * proration, 2)
    incentive = round(incentive_rate * proration, 2)

    if employee.get("pf_applicable"):
        pf_gross_limit = float(employee.get("pf_gross_limit") or 0)
        pf = compute_pf(basic, pf_gross_limit, bool(employee.get("eps_applicable")))
    else:
        pf = ZERO_PF

    esic_gross_wages = basic + hra + conveyance + other_allowance + monthly_bonus + retention + incentive
    esic = compute_esic(esic_gross_wages) if employee.get("esic_applicable") else ZERO_ESIC
    ded_pf = pf["ded_pf"]
    ded_esic = esic["ded_esic"]

    state = location_to_state(employee.get("location"))
    ded_pt = round(compute_pt(esic_gross_wages, state, employee.get("gender"), month), 2) if employee.get("pt_applicable") else 0.0
    lwf = compute_lwf(state, month) if employee.get("lwf_applicable") else {"ded_lwf": 0.0, "oth_lwf_wages": 0.0}
    ded_lwf = lwf["ded_lwf"]

    # OT divisor always uses the full monthly rate, never the prorated actual
    # (a partial-attendance month doesn't change what an hour of OT is worth).
    rate_gross_for_ot = basic_rate + hra_rate + conveyance_rate
    # Nimit-style per-employee override: divide by a fixed working-days/month
    # figure instead of the calendar length of the pay period.
    rate_divisor = float(employee.get("standard_working_days_per_month") or 0) or total_days
    per_day_salary = rate_gross_for_ot / rate_divisor if rate_divisor else 0
    per_hour_salary = per_day_salary / standard_hours if standard_hours else 0
    ot_amount = per_hour_salary * total_ot_hours if employee.get("ot_applicable", True) else 0.0
    # Informational only — red-card/late-coming LOP is already reflected in
    # the reduced `paid_days` used to prorate Basic/HRA/Conveyance/Other
    # Allowance/Incentive above, so it must NOT also be subtracted from
    # gross/total_payable below or it would be double-deducted.
    lop_amount = per_day_salary * (late_lop_days + red_card_lop_leave_days)

    period_start, period_end = pay_period_bounds(year, month)

    return {
        "employee_id": employee["id"],
        "employee_code": employee["employee_code"],
        "name": f"{employee['first_name']} {employee.get('last_name', '')}".strip(),
        "location": employee.get("location", ""),
        "designation": employee.get("designation", ""),
        "department": employee.get("department", ""),
        "date_of_joining": employee.get("date_of_joining"),
        "exit_date": employee.get("exit_date"),
        "pan_no": employee.get("pan_no", ""),
        "uan_no": employee.get("uan_no", ""),
        "aadhar_no": employee.get("aadhar_no", ""),
        "pf_no": employee.get("pf_no", ""),
        "esic_no": employee.get("esic_no", ""),
        "payment_mode": employee.get("payment_mode", ""),
        "bank_name": employee.get("bank_name", ""),
        "bank_account_no": employee.get("bank_account_no", ""),
        "bank_ifsc": employee.get("bank_ifsc", ""),
        "employee_category": employee.get("employee_category", ""),
        "gender": employee.get("gender", ""),
        "date_of_birth": employee.get("date_of_birth"),
        "grade": employee.get("grade", ""),
        "cost_center": employee.get("cost_center", ""),
        "year": year,
        "month": month,
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "days_in_month": total_days,
        "present_days": present_days,
        "absent_days": absent_days,
        "holiday_days": holiday_days,
        "leave_days": leave_days,
        "weekoff_days": weekoff_days,
        "pl_days": pl_days,
        "paid_days": round(paid_days, 1),
        "late_days": late_days,
        "on_time_days": on_time_days,
        "late_mark_count": late_mark_count,
        "red_card": red_card,
        "lop_days": late_lop_days,
        "lop_amount": round(lop_amount, 2),
        "without_pay_days": round(without_pay_days, 1),
        "total_hours_worked": total_hours_worked,
        "total_ot_hours": total_ot_hours,
        "basic": round(basic, 2),
        "hra": round(hra, 2),
        "conveyance": round(conveyance, 2),
        "other_allowance": round(other_allowance, 2),
        "monthly_bonus": round(monthly_bonus, 2),
        "retention": round(retention, 2),
        "incentive": round(incentive, 2),
        # Full monthly rate behind each prorated figure above (hr_employees'
        # flat value, unscaled by attendance) — the payslip/salary-register
        # "(Rate)" columns.
        "basic_rate": round(basic_rate, 2),
        "hra_rate": round(hra_rate, 2),
        "conveyance_rate": round(conveyance_rate, 2),
        "other_allowance_rate": round(other_allowance_rate, 2),
        "monthly_bonus_rate": round(monthly_bonus_rate, 2),
        "retention_rate": round(retention_rate, 2),
        "incentive_rate": round(incentive_rate, 2),
        # CTC is the standing monthly rate — Incentive is variable/discretionary
        # and belongs only in its own column and in TotalErn, never folded in here.
        "ctc": round(basic_rate + hra_rate + conveyance_rate + other_allowance_rate, 2),
        "per_day_salary": round(per_day_salary, 2),
        "per_hour_salary": round(per_hour_salary, 2),
        "ot_amount": round(ot_amount, 2),
        "ded_pf": ded_pf,
        "ded_esic": ded_esic,
        "ded_pt": ded_pt,
        "ded_lwf": ded_lwf,
        "ded_tds": round(monthly_tds, 2),
        "ded_standing_loan": ded_standing_loan,
        # Employer-side statutory breakdown — not part of the employee's own
        # deductions/take-home, exposed for the PF/ESIC/LWF report/challan pages.
        "pf_wages": pf["oth_pf_wages"],
        "eps_wages": pf["oth_eps_wages"],
        "edli_wages": pf["oth_edli_wages"],
        "pf_employer_eps": pf["oth_eps"],
        "pf_employer_epf": pf["oth_epf"],
        "pf_edli_charges": pf["oth_edli_charges"],
        "pf_admin_charges": pf["oth_pf_admin_charges"],
        "esic_wages": esic["oth_esic_wages"],
        "esic_employer": esic["oth_esic_employer"],
        "lwf_employer": lwf["oth_lwf_wages"],
        "gross_salary": round(basic + hra + conveyance + other_allowance + monthly_bonus + retention + incentive, 2),
        "total_payable": round(
            basic + hra + conveyance + other_allowance + monthly_bonus + retention + incentive
            + ot_amount - ded_pf - ded_esic - ded_pt - ded_lwf - monthly_tds - ded_standing_loan,
            2,
        ),
        "daily": daily,
    }
