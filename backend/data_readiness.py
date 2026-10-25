"""Data-readiness checks for jade-hr: is the data the payroll/attendance engine
(and any AI feature built on it) reads fit to be trusted?

Pure functions over already-fetched rows, so every rule is unit-testable
without a database (routers/data_readiness.py does the fetching). Nothing
here writes, and nothing here creates or "fixes" an employee — it only
reports, per the standing rule that imports/syncs never auto-create staff.

Structure follows the data-readiness checklist: each check belongs to a
dimension (quality, freshness, source of truth, permissions, ...), and a
weak check does not just fail — it names the control that makes it safe to
proceed. Overall decision is one of: ready / ready_with_controls / not_ready.
"""

from datetime import date, datetime, timedelta, timezone

import payroll

SAMPLE_SIZE = 8
SALARY_FIELDS = ("basic", "hra", "conveyance", "other_allowance", "monthly_bonus", "retention", "incentive")

# --- Severity -> decision ----------------------------------------------------
OK, WARN, BLOCK = "ok", "warn", "block"
DECISIONS = {
    OK: "ready",
    WARN: "ready_with_controls",
    BLOCK: "not_ready",
}


def overall_decision(checks: list[dict]) -> str:
    severities = {c["severity"] for c in checks}
    if BLOCK in severities:
        return DECISIONS[BLOCK]
    if WARN in severities:
        return DECISIONS[WARN]
    return DECISIONS[OK]


def _name(emp: dict) -> str:
    full = f"{emp.get('first_name') or ''} {emp.get('last_name') or ''}".strip()
    return f"{full} ({emp.get('employee_code')})" if full else str(emp.get("employee_code"))


def _blank(value) -> bool:
    return value is None or str(value).strip() == ""


def _check(key, dimension, title, flagged, total, severity_if_any, control, why="") -> dict:
    count = len(flagged)
    return {
        "key": key,
        "dimension": dimension,
        "title": title,
        "why": why,
        "count": count,
        "total": total,
        "severity": severity_if_any if count else OK,
        "control": control if count else "",
        "sample": [_name(e) for e in flagged[:SAMPLE_SIZE]],
    }


# --- Quality / completeness --------------------------------------------------
def quality_checks(employees: list[dict], profiles: dict) -> list[dict]:
    """employees: active hr_employees rows. profiles: employee_id -> profile row."""
    non_flexible = [
        e for e in employees
        if (profiles.get(e["id"], {}).get("time_slot") or "") != payroll.FLEXIBLE_TIME_SLOT
    ]
    blank_slot = [e for e in non_flexible if _blank(profiles.get(e["id"], {}).get("time_slot"))]
    unknown_slot = [
        e for e in non_flexible
        if not _blank(profiles.get(e["id"], {}).get("time_slot"))
        and profiles[e["id"]]["time_slot"] not in payroll.SHIFT_START_BY_TIME_SLOT
    ]

    def missing_profile(field):
        return [e for e in employees if _blank(profiles.get(e["id"], {}).get(field))]

    n = len(employees)
    return [
        _check(
            "blank_time_slot", "quality", "Active employees with no Time Slot", blank_slot, n, WARN,
            "Confirm each person really works the 10:00 AM shift; set the Time Slot on Employee Details > Official for anyone who does not.",
            "A blank slot silently defaults to a 10:00 AM start, which is right for most staff but creates false late marks for anyone on another shift.",
        ),
        _check(
            "unknown_time_slot", "quality", "Time Slot not recognised by the late-mark engine", unknown_slot, n, WARN,
            "Add the slot under Store Timings, or correct the spelling, so it is graded on its own start time.",
            "An unrecognised label also falls back to 10:00 AM.",
        ),
        _check(
            "no_leave_approver", "quality", "No reporting manager / leave approver",
            [e for e in employees if not e.get("leave_approver_id")], n, WARN,
            "Assign one on Reporting Managers; HR handles their leave and WFH by hand until then.",
        ),
        _check("no_email", "quality", "No email address", [e for e in employees if _blank(e.get("email"))], n, WARN,
               "Add one, or Tina's emails (leave decisions, letters) reach nobody."),
        _check("no_joining_date", "quality", "No date of joining",
               [e for e in employees if not e.get("date_of_joining")], n, WARN,
               "Fill it in; anniversaries, confirmations and gratuity read it."),
        _check("no_dob", "quality", "No date of birth", missing_profile("date_of_birth"), n, WARN,
               "Fill-only import from the master sheet; never overwrite existing values."),
        _check("no_pan", "quality", "No PAN", missing_profile("pan_no"), n, WARN, "Needed for TDS."),
        _check("no_aadhar", "quality", "No Aadhar", missing_profile("aadhar_no"), n, WARN, "Needed for KYC."),
        _check("no_bank", "quality", "No bank account / IFSC",
               [e for e in employees
                if _blank(profiles.get(e["id"], {}).get("bank_account_no"))
                or _blank(profiles.get(e["id"], {}).get("bank_ifsc"))],
               n, WARN, "Salary transfer files will skip them."),
        _check("no_salary_figures", "quality", "No salary figures on file at all",
               [e for e in employees if not any(float(e.get(k) or 0) for k in SALARY_FIELDS)],
               n, WARN, "Load their salary sheet before processing; their payslip, PF and ESIC will all come out zero."),
    ]


def duplicate_checks(employees: list[dict], profiles: dict) -> list[dict]:
    """The same Aadhar / PAN / phone on two active people is almost always a
    keying error or a duplicated employee record."""
    out = []
    for key, title, getter in (
        ("dup_aadhar", "Same Aadhar on more than one active employee", lambda e: profiles.get(e["id"], {}).get("aadhar_no")),
        ("dup_pan", "Same PAN on more than one active employee", lambda e: profiles.get(e["id"], {}).get("pan_no")),
        ("dup_phone", "Same phone on more than one active employee", lambda e: e.get("phone")),
    ):
        seen: dict[str, list[dict]] = {}
        for e in employees:
            raw = getter(e)
            if _blank(raw):
                continue
            norm = "".join(ch for ch in str(raw) if ch.isalnum()).upper()
            seen.setdefault(norm, []).append(e)
        flagged = [e for group in seen.values() if len(group) > 1 for e in group]
        out.append(_check(key, "quality", title, flagged, len(employees), WARN,
                          "Open both records and correct whichever is wrong."))
    return out


# --- Freshness / operations --------------------------------------------------
def _age_hours(ts, now: datetime) -> float | None:
    if not ts:
        return None
    if isinstance(ts, str):
        ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    if ts.tzinfo is None:
        ts = ts.replace(tzinfo=timezone.utc)
    return (now - ts).total_seconds() / 3600


def feed_status(name, owner, expected_hours, last_ts, now: datetime, what_it_feeds: str) -> dict:
    age = _age_hours(last_ts, now)
    if age is None:
        status, severity = "never_run", BLOCK
    elif age > expected_hours * 2:
        status, severity = "stale", BLOCK
    elif age > expected_hours:
        status, severity = "late", WARN
    else:
        status, severity = "fresh", OK
    return {
        "feed": name,
        "owner": owner,
        "expected_every_hours": expected_hours,
        "last_updated": last_ts if isinstance(last_ts, str) else (last_ts.isoformat() if last_ts else None),
        "age_hours": round(age, 1) if age is not None else None,
        "status": status,
        "severity": severity,
        "feeds": what_it_feeds,
    }


def roster_streak_check(employees: list[dict]) -> dict:
    flagged = [e for e in employees if (e.get("roster_unmatched_streak") or 0) > 0]
    return _check("roster_unmatched", "freshness", "Missing from the nightly roster sync", flagged, len(employees), WARN,
                  "Confirm they still work here; the sync never deactivates anyone on its own.")


def register_coverage(register_rows: list[dict], employees: list[dict], start: date, end: date) -> dict:
    """Source-of-truth rule: payroll uses the imported attendance register ONLY
    when an employee has a row for every day of the pay period; a partial
    register is silently ignored and the engine re-derives from punches. That
    switch is invisible on the payslip, so surface who is on which side."""
    days = (end - start).days + 1
    per_emp: dict[str, int] = {}
    for r in register_rows:
        per_emp[r["employee_id"]] = per_emp.get(r["employee_id"], 0) + 1
    full = [e for e in employees if per_emp.get(e["id"], 0) >= days]
    partial = [e for e in employees if 0 < per_emp.get(e["id"], 0) < days]
    return {
        "period": {"start": start.isoformat(), "end": end.isoformat(), "days": days},
        "on_register": len(full),
        "on_engine": len(employees) - len(full) - len(partial),
        "partial": _check(
            "partial_register", "source_of_truth", "Register covers only part of the pay period", partial,
            len(employees), WARN,
            "Load the missing days, or clear the partial rows; until then payroll ignores the register for them.",
            "Payroll falls back to punches for these people, so the payslip may disagree with the sheet.",
        ),
    }


# --- Permissions / sensitivity ----------------------------------------------
def access_checks(employees_all: list[dict], hr_permissions: list[dict]) -> list[dict]:
    console = [e for e in employees_all if e.get("is_active") and e.get("role") in ("hr", "accounts")]
    on_assigned_pw = [e for e in console if not e.get("password_changed_by_employee")]
    return [
        _check(
            "console_default_password", "permissions", "HR/Accounts logins still on a password someone else set",
            on_assigned_pw, len(console), WARN,
            "Ask them to change it; these logins can see salary and identity data.",
        ),
        {
            "key": "hr_default_permissions",
            "dimension": "permissions",
            "title": "Console capabilities every HR login gets by default",
            "why": "Anything listed here is open to all HR-role accounts unless a person override turns it off.",
            "count": sum(1 for p in hr_permissions if p.get("hr_can_access")),
            "total": len(hr_permissions),
            "severity": OK,
            "control": "",
            "sample": sorted(p["permission_key"] for p in hr_permissions if p.get("hr_can_access"))[:SAMPLE_SIZE * 4],
        },
    ]


# --- Definitions: one place, derived from the engine's own constants ----------
def _leave_definitions() -> dict:
    """Leave and Comp-Off rules, read from routers/leave.py (imported lazily so
    this module stays light for the pure-function tests)."""
    from routers import leave

    return {
        "paid_leave_annual_days": leave.PAID_LEAVE_ANNUAL_CAP,
        "paid_leave_probation_days": leave.PL_PROBATION_DAYS,
        "carry_forward_cap_hq_days": leave.CARRY_FORWARD_CAP_HQ,
        "carry_forward_cap_retail_days": leave.CARRY_FORWARD_CAP_RETAIL,
        "paternity_days": leave.PATERNITY_ALLOCATION,
        "comp_off_validity_days": leave.COMP_OFF_VALIDITY_DAYS,
        "comp_off_max_days_per_request": leave.COMP_OFF_MAX_DAYS_PER_REQUEST,
        "blocked_during_red_card": sorted(leave.RED_CARD_BLOCKED_TYPES),
        "corporate_only_types": sorted(leave.CORPORATE_ONLY_TYPES),
        "retired_leave_types": list(leave.DEPRECATED_LEAVE_TYPES),
    }


def policy_definitions() -> dict:
    """What 'late', 'free mark', 'LOP' and the cards mean, and from which date.
    Every number is read from payroll.py so this page can never drift from the
    engine; only the wording lives here."""
    return {
        "policies": [
            {
                "version": "v1.1",
                "applies": f"pay periods before {payroll.LATE_POLICY_V3_EFFECTIVE.isoformat()} and the v2 date logic",
                "grace": f"on time by {payroll.LATE_GRACE.strftime('%H:%M')}",
                "free_marks": payroll.LATE_FREE_COUNT,
                "lop_per_chargeable_mark_days": payroll.LATE_LOP_DAYS,
                "red_card_at_marks": payroll.RED_CARD_LATE_MARKS,
                "status": "superseded",
            },
            {
                "version": "v2",
                "effective_from": payroll.LATE_POLICY_V2_EFFECTIVE.isoformat(),
                "grace": f"late only beyond 10:{payroll.LATE_GRACE_MINUTES_V2:02d}",
                "free_marks": payroll.LATE_FREE_COUNT_V2,
                "lop_tiers_days": [payroll.LATE_LOP_QUARTER_DAY_V2, payroll.LATE_LOP_HALF_DAY_V2],
                "red_card_at_marks": payroll.RED_CARD_LATE_MARKS_V2,
                "status": "superseded by v3 for any date on or after v3's start",
            },
            {
                "version": "v3 (Attendance, Punctuality, Leave & WFH Policy v2.0)",
                "effective_from": payroll.LATE_POLICY_V3_EFFECTIVE.isoformat(),
                "daily_tolerance_minutes": payroll.V3_DAILY_TOLERANCE_END_MIN,
                "extended_buffer_minutes": payroll.V3_EXTENDED_BUFFER_END_MIN,
                "level1_end_minutes": payroll.V3_LEVEL1_END_MIN,
                "level2_end_minutes": payroll.V3_LEVEL2_END_MIN,
                "free_buffer_arrivals_per_cycle": payroll.V3_FREE_BUFFER_COUNT,
                "level_lop_days": payroll.V3_LEVEL_LOP_DAYS,
                "yellow_cards_for_red": payroll.V3_YELLOW_CARDS_FOR_RED,
                "quarter_red_card_pl_forfeit_days": payroll.QUARTER_RED_CARD_PL_FORFEIT,
                "status": "in force",
            },
        ],
        "leave": _leave_definitions(),
        "terms": {
            "Pay period": "23rd of the previous month to the 22nd of the labelled month.",
            "Late mark": "An arrival after the grace for the employee's own Time Slot (never a global 10:00).",
            "Flexible slot": "Graded on hours worked in the day, never on arrival time.",
            "LOP": "Loss of pay, in fractions of a day as set by the policy version in force on that date.",
            "Yellow / Red Card": "Yellow = a counted late arrival; Red = the monthly threshold in the version in force.",
            "Quarter Red Card": "A Red Card in every month of a financial-year quarter: Final Warning plus automatic Paid Leave forfeiture.",
        },
        "conflict_rules": [
            "Imported attendance register for the full pay period wins over punches; a partial register is ignored.",
            "An approved attendance override or dispute wins over raw punches for that day.",
            "Raw biometric punches are the fallback and the evidence, never edited.",
            "Policy version is chosen by the date being graded, not by today's date.",
        ],
    }
