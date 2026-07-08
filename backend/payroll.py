"""OT / attendance calculation engine.

Formula (as specified by JADE HR ops), example — Sarita:
    Basic = 16,000, HRA = 9,600, Conveyance = 1,200 -> Total = 26,800
    Days in Month = 31
    Per Day Salary  = 26,800 / 31   = 864.51
    Per Hour Salary = 864.51 / 8    = 108.06
    Total OT Hours  = 21.54
    OT Amount = 108.06 x 21.54 = 2,328 (approx)
"""

import calendar
from collections import defaultdict
from datetime import date, datetime, timezone


def days_in_month(year: int, month: int) -> int:
    return calendar.monthrange(year, month)[1]


def group_punches_by_day(punch_times: list[datetime]) -> dict[date, list[datetime]]:
    by_day: dict[date, list[datetime]] = defaultdict(list)
    for pt in punch_times:
        by_day[pt.astimezone(timezone.utc).date()].append(pt)
    for day_punches in by_day.values():
        day_punches.sort()
    return by_day


def compute_daily_attendance(
    year: int,
    month: int,
    punch_times: list[datetime],
    standard_hours_per_day: float,
) -> list[dict]:
    """One row per calendar day in the month, present/absent/future + hours + OT."""
    by_day = group_punches_by_day(punch_times)
    total_days = days_in_month(year, month)
    today = datetime.now(timezone.utc).date()

    rows = []
    for day_num in range(1, total_days + 1):
        d = date(year, month, day_num)
        punches = by_day.get(d, [])

        if not punches:
            status = "future" if d > today else "absent"
            rows.append({
                "date": d.isoformat(),
                "first_in": None,
                "last_out": None,
                "hours_worked": 0.0,
                "ot_hours": 0.0,
                "status": status,
            })
            continue

        first_in = punches[0]
        last_out = punches[-1]
        hours_worked = max(0.0, (last_out - first_in).total_seconds() / 3600.0)
        ot_hours = max(0.0, hours_worked - standard_hours_per_day)

        rows.append({
            "date": d.isoformat(),
            "first_in": first_in.isoformat(),
            "last_out": last_out.isoformat(),
            "hours_worked": round(hours_worked, 2),
            "ot_hours": round(ot_hours, 2),
            "status": "present",
        })

    return rows


def compute_monthly_summary(employee: dict, year: int, month: int, punch_times: list[datetime]) -> dict:
    standard_hours = float(employee.get("standard_hours_per_day") or 8)
    daily = compute_daily_attendance(year, month, punch_times, standard_hours)

    present_days = sum(1 for r in daily if r["status"] == "present")
    absent_days = sum(1 for r in daily if r["status"] == "absent")
    total_hours_worked = round(sum(r["hours_worked"] for r in daily), 2)
    total_ot_hours = round(sum(r["ot_hours"] for r in daily), 2)

    basic = float(employee.get("basic") or 0)
    hra = float(employee.get("hra") or 0)
    conveyance = float(employee.get("conveyance") or 0)
    other_allowance = float(employee.get("other_allowance") or 0)

    gross_for_ot = basic + hra + conveyance
    total_days = days_in_month(year, month)
    per_day_salary = gross_for_ot / total_days if total_days else 0
    per_hour_salary = per_day_salary / standard_hours if standard_hours else 0
    ot_amount = per_hour_salary * total_ot_hours

    return {
        "employee_id": employee["id"],
        "employee_code": employee["employee_code"],
        "name": f"{employee['first_name']} {employee.get('last_name', '')}".strip(),
        "year": year,
        "month": month,
        "days_in_month": total_days,
        "present_days": present_days,
        "absent_days": absent_days,
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
        "total_payable": round(gross_for_ot + other_allowance + ot_amount, 2),
        "daily": daily,
    }
