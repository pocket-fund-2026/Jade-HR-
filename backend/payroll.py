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

# Grace period: clocking in by 10:10 AM IST counts as on time.
LATE_GRACE = time(10, 10)


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


def _apply_override(d: date, override: dict, standard_hours_per_day: float) -> dict:
    status = override["status_override"]
    first_in, last_out = override.get("first_in"), override.get("last_out")

    hours_worked = ot_hours = 0.0
    first_in_iso = last_out_iso = None
    late = False
    if status == "present" and first_in and last_out:
        start = datetime.combine(d, first_in, tzinfo=IST)
        end = datetime.combine(d, last_out, tzinfo=IST)
        hours_worked = max(0.0, (end - start).total_seconds() / 3600.0)
        ot_hours = max(0.0, hours_worked - standard_hours_per_day)
        first_in_iso, last_out_iso = start.isoformat(), end.isoformat()
        late = first_in > LATE_GRACE
    elif status == "present":
        hours_worked = standard_hours_per_day
    elif status == "half_day":
        hours_worked = standard_hours_per_day / 2

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
    holiday is flagged comp-off eligible. Late-mark/Red-Card/LOP-by-lateness
    is cross-day cycle state, computed in compute_monthly_summary instead.
    """
    overrides = overrides or {}
    leaves = leaves or {}
    holidays = holidays or {}
    by_day = group_punches_by_day(punch_times)
    start, end = pay_period_bounds(year, month)
    today = datetime.now(IST).date()

    rows = []
    d = start
    while d <= end:
        if d in overrides:
            rows.append(_apply_override(d, overrides[d], standard_hours_per_day))
            d += timedelta(days=1)
            continue

        punches = by_day.get(d, [])
        is_closed_holiday = is_corporate and holidays.get(d, {}).get("day_type") == "closed"

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
        hours_worked = max(0.0, (last_out - first_in).total_seconds() / 3600.0)
        ot_hours = max(0.0, hours_worked - standard_hours_per_day)
        first_in_local = first_in.astimezone(IST).time()

        row = {
            "date": d.isoformat(),
            "first_in": first_in.isoformat(),
            "last_out": last_out.isoformat(),
            "hours_worked": round(hours_worked, 2),
            "ot_hours": round(ot_hours, 2),
            "status": "present",
            "late": first_in_local > LATE_GRACE,
        }
        if is_corporate:
            row["after_noon"] = first_in_local > NOON
            if d.weekday() == weekly_off_day or is_closed_holiday:
                row["comp_off_eligible"] = True
                row["comp_off_units"] = 0.5 if hours_worked <= 4 else 1.0
        rows.append(row)
        d += timedelta(days=1)

    return rows


def _apply_late_coming_policy(daily: list[dict]) -> tuple[int, bool]:
    """Corporate-roster-only (Leave & Attendance Policy v1.1, section 4):
    first 2 late arrivals in the cycle are free; the 3rd onward — or any
    arrival after 12:00 PM regardless of count — is a ½ day LOP. 5+ late
    marks in the cycle is a Red Card: any leave day not already
    admin-corrected becomes LOP too (section 4 exception for a documented
    medical emergency is a manual call — use the existing attendance-
    override mechanism to restore a specific day).

    Mutates `daily` in place (tags lop_half_day / red_card_lop) and returns
    (late_mark_count, red_card).
    """
    late_ordinal = 0
    for r in daily:
        if r["status"] == "present" and r.get("late"):
            late_ordinal += 1
            if r.get("after_noon") or late_ordinal >= 3:
                r["lop_half_day"] = True

    red_card = late_ordinal >= 5
    if red_card:
        for r in daily:
            if r["status"] == "leave" and r.get("leave_type") != "unpaid" and not r.get("corrected"):
                r["red_card_lop"] = True

    return late_ordinal, red_card


def compute_monthly_summary(
    employee: dict,
    year: int,
    month: int,
    punch_times: list[datetime],
    overrides: dict[date, dict] | None = None,
    leaves: dict[date, str] | None = None,
    holidays: dict[date, dict] | None = None,
) -> dict:
    standard_hours = float(employee.get("standard_hours_per_day") or 8)
    weekly_off_day = int(employee.get("weekly_off_day") if employee.get("weekly_off_day") is not None else 6)
    is_corporate = employee.get("employee_category") == "corporate"
    daily = compute_daily_attendance(
        year, month, punch_times, standard_hours, overrides, leaves, weekly_off_day,
        holidays=holidays, is_corporate=is_corporate,
    )

    late_mark_count, red_card = _apply_late_coming_policy(daily) if is_corporate else (0, False)

    present_days = sum(1 for r in daily if r["status"] == "present")
    absent_days = sum(1 for r in daily if r["status"] == "absent")
    holiday_days = sum(1 for r in daily if r["status"] == "holiday")
    leave_days = sum(1 for r in daily if r["status"] == "leave")
    weekoff_days = sum(1 for r in daily if r["status"] == "weekoff")
    half_days = sum(1 for r in daily if r["status"] == "half_day")
    unpaid_leave_days = sum(1 for r in daily if r["status"] == "leave" and r.get("leave_type") == "unpaid")
    red_card_lop_leave_days = sum(1 for r in daily if r.get("red_card_lop"))
    lop_half_days = sum(1 for r in daily if r.get("lop_half_day"))
    pl_days = leave_days - unpaid_leave_days - red_card_lop_leave_days
    paid_days = present_days + weekoff_days + holiday_days + pl_days + 0.5 * half_days - 0.5 * lop_half_days
    late_days = sum(1 for r in daily if r["status"] == "present" and r.get("late"))
    on_time_days = present_days - late_days
    total_hours_worked = round(sum(r["hours_worked"] for r in daily), 2)
    total_ot_hours = round(sum(r["ot_hours"] for r in daily), 2)

    basic = float(employee.get("basic") or 0)
    hra = float(employee.get("hra") or 0)
    conveyance = float(employee.get("conveyance") or 0)
    other_allowance = float(employee.get("other_allowance") or 0)

    gross_for_ot = basic + hra + conveyance
    total_days = days_in_month(year, month)
    # Nimit-style per-employee override: divide by a fixed working-days/month
    # figure instead of the calendar length of the pay period.
    rate_divisor = float(employee.get("standard_working_days_per_month") or 0) or total_days
    per_day_salary = gross_for_ot / rate_divisor if rate_divisor else 0
    per_hour_salary = per_day_salary / standard_hours if standard_hours else 0
    ot_amount = per_hour_salary * total_ot_hours
    lop_amount = per_day_salary * (0.5 * lop_half_days + red_card_lop_leave_days)

    period_start, period_end = pay_period_bounds(year, month)

    return {
        "employee_id": employee["id"],
        "employee_code": employee["employee_code"],
        "name": f"{employee['first_name']} {employee.get('last_name', '')}".strip(),
        "location": employee.get("location", ""),
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
        "lop_half_days": lop_half_days,
        "lop_amount": round(lop_amount, 2),
        "total_hours_worked": total_hours_worked,
        "total_ot_hours": total_ot_hours,
        "basic": round(basic, 2),
        "hra": round(hra, 2),
        "conveyance": round(conveyance, 2),
        "other_allowance": round(other_allowance, 2),
        "per_day_salary": round(per_day_salary, 2),
        "per_hour_salary": round(per_hour_salary, 2),
        "ot_amount": round(ot_amount, 2),
        "gross_salary": round(gross_for_ot + other_allowance, 2),
        "total_payable": round(gross_for_ot + other_allowance + ot_amount - lop_amount, 2),
        "daily": daily,
    }
