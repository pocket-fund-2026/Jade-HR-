"""Arrear maths + payroll integration (pure functions, no DB access).

Pay periods run 23rd of the prior month through the 22nd of the labelled
month (see payroll.pay_period_bounds). An arrear is paid in ONE pay period
(`pay_year`/`pay_month`) and, once status='approved', is added to that
period's total_payable (net pay) — so it lands on the payslip, the Salary
Sheet and the Bank Transfer file consistently.

Statutory treatment: arrears carry no PF/ESIC (same as the existing
ESIC_WAGE_KEYS rule in routers/salary_structure.py). TDS is NOT re-projected
automatically; Accounts enters the tax to withhold on the arrear in
`tds_amount`, which is deducted from the arrear's net contribution.
"""

import calendar
from datetime import date, timedelta

# First pay period whose net pay includes approved arrears. Earlier periods
# keep their old behaviour (arrears display on the Salary Sheet only) so
# payslips that were already issued don't move — same convention as
# statutory.PF_DEDUCTION_CAP_FROM.
ARREAR_NET_PAY_FROM = (2026, 12)

REASONS = ("salary_revision", "unpaid_salary", "attendance_correction", "bonus_or_incentive", "other")
STATUSES = ("pending", "approved", "cancelled")


def pay_period_for_date(d: date) -> tuple[int, int]:
    """The (year, month) pay period label a calendar date falls in."""
    if d.day >= 23:
        return (d.year + 1, 1) if d.month == 12 else (d.year, d.month + 1)
    return d.year, d.month


def period_bounds(year: int, month: int) -> tuple[date, date]:
    py, pm = (year - 1, 12) if month == 1 else (year, month - 1)
    return date(py, pm, 23), date(year, month, 22)


def _next_period(year: int, month: int) -> tuple[int, int]:
    return (year + 1, 1) if month == 12 else (year, month + 1)


def calculate_revision_arrear(old_monthly: float, new_monthly: float, from_date: date, to_date: date) -> dict:
    """Arrear owed after a retroactive pay revision: (new - old) monthly
    amount, pro-rated by calendar days for each pay period touched by
    [from_date, to_date]. Returns the total and a per-period breakdown so
    Accounts can show their working."""
    if to_date < from_date:
        raise ValueError("'to' date must be on or after 'from' date")
    if (to_date - from_date).days > 800:
        raise ValueError("Range too long (max ~26 months)")
    diff = float(new_monthly) - float(old_monthly)
    lines = []
    y, m = pay_period_for_date(from_date)
    last = pay_period_for_date(to_date)
    while (y, m) <= last:
        p_start, p_end = period_bounds(y, m)
        lo, hi = max(p_start, from_date), min(p_end, to_date)
        period_days = (p_end - p_start).days + 1
        days = (hi - lo).days + 1
        if days > 0:
            lines.append({
                "pay_year": y, "pay_month": m,
                "from": lo.isoformat(), "to": hi.isoformat(),
                "days": days, "period_days": period_days,
                "amount": round(diff * days / period_days, 2),
            })
        y, m = _next_period(y, m)
    return {
        "monthly_difference": round(diff, 2),
        "total": round(sum(l["amount"] for l in lines), 2),
        "lines": lines,
    }


def net_effect(item: dict) -> float:
    """What one approved arrear row adds to net pay."""
    return float(item.get("arrear_amount") or 0) - float(item.get("tds_amount") or 0)


def apply_arrears(summary: dict, items: list[dict], year: int, month: int) -> dict:
    """Adds approved arrear rows for (year, month) to a monthly summary.
    Always sets summary['arrear'] (gross arrear) and summary['arrear_tds'];
    only changes total_payable from ARREAR_NET_PAY_FROM onwards."""
    gross = round(sum(float(i.get("arrear_amount") or 0) for i in items), 2)
    tds = round(sum(float(i.get("tds_amount") or 0) for i in items), 2)
    summary["arrear"] = gross
    summary["arrear_tds"] = tds
    summary["arrear_in_net"] = bool(items) and (year, month) >= ARREAR_NET_PAY_FROM
    if summary["arrear_in_net"] and not summary.get("calc_error"):
        summary["total_payable"] = round(summary["total_payable"] + gross - tds, 2)
    return summary
