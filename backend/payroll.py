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

import calendar
from collections import defaultdict
import re
from datetime import date, datetime, time, timedelta

from config import IST
from statutory import ZERO_ESIC, ZERO_PF, compute_esic, esic_applies, esic_wages as esic_wage_base, compute_lwf, compute_pf, compute_pt, location_to_state

# ── Late-coming policy generations ──────────────────────────────────────────
# JADE HR's Sept 2026 policy change (w.e.f. 22 Sept 2026) widens the grace
# window, gives a 3-late Yellow Card allowance and splits the deduction into
# two tiers. Both generations live side by side because payroll for periods
# BEFORE the effective date must keep recomputing exactly as it did when it
# was run — a payslip already issued under v1.1 can never silently change.
#
# Which generation applies is decided in two places, deliberately:
#   * per DAY   — the grace cutoff and the deduction tier (a 15 Sept arrival is
#                 judged on v1.1's 10:11 grace, a 25 Sept one on v2's 10:20)
#   * per CYCLE — the free-late allowance and the Yellow/Red Card thresholds,
#                 since those are inherently monthly counters and can't be
#                 split mid-month (gated on the pay period's END date, so the
#                 transitional 23 Aug–22 Sept 2026 cycle already counts under
#                 v2 — the cycle the policy takes effect in).
LATE_POLICY_V2_EFFECTIVE = date(2026, 9, 22)


def late_policy_v2_active(d: date) -> bool:
    """Is the 22-Sept-2026 late-coming revision in force on day `d`?"""
    return d >= LATE_POLICY_V2_EFFECTIVE


# Grace period: clocking in by 10:11 AM IST (v1.1) / 10:20 AM IST (v2, w.e.f.
# 22 Sept 2026) counts as on time. This is the 10:00 AM shift's grace — the
# default/fallback for any unrecognized/blank
# time_slot (see SHIFT_START_BY_TIME_SLOT / _late_grace_for below, which
# generalize this to every other time_slot). "Flexible" does NOT use this
# fallback — see FLEXIBLE_TIME_SLOT below, it's graded on hours, not arrival.
LATE_GRACE = time(10, 11)
LATE_GRACE_MINUTES = 11
LATE_GRACE_MINUTES_V2 = 20  # w.e.f. 22 Sept 2026: "beyond 10:20 am" is late

# Per-time_slot (hr_employee_profile.time_slot) shift start used to derive
# each employee's own late-grace cutoff (start + LATE_GRACE_MINUTES) instead
# of the single global LATE_GRACE constant above — an employee moved to a
# later shift (e.g. "11:00 AM – 8:00 PM") must be graced against THAT shift's
# start, not everyone's 10:11 AM. Any time_slot not listed here (including
# None/blank) falls back to DEFAULT_SHIFT_START so nobody currently on the
# standard shift regresses. Never consulted for FLEXIBLE_TIME_SLOT.
DEFAULT_SHIFT_START = time(10, 0)
SHIFT_START_BY_TIME_SLOT = {
    "10:00 AM – 6:30 PM": time(10, 0),
    "10:00 AM – 7:00 PM": time(10, 0),
    "10:00 AM – 7:40 PM": time(10, 0),
    "11:00 AM – 8:00 PM": time(11, 0),
    "Intern (10:00 AM – 6:00 PM)": time(10, 0),
}

# "Flexible" has no fixed clock-in time to grade against at all — lateness for
# these employees is judged purely on whether they completed their standard
# shift-length hours that day, never on arrival time.
FLEXIBLE_TIME_SLOT = "Flexible"


def register_time_slot(label: str, shift_start: time) -> None:
    """Adds/updates a time_slot's shift start at runtime, so slots defined
    by HR in the console (hr_time_slots table, routers/store_timings.py)
    grade lateness correctly without a code deploy. Called once at backend
    startup for every row on file, and again after any admin add/edit/delete
    so the change takes effect immediately."""
    SHIFT_START_BY_TIME_SLOT[label] = shift_start


def unregister_time_slot(label: str) -> None:
    SHIFT_START_BY_TIME_SLOT.pop(label, None)


def _late_grace_for(time_slot: str | None, day: date) -> time:
    """This employee's late-grace cutoff on `day`: their shift's start time
    (per SHIFT_START_BY_TIME_SLOT, DEFAULT_SHIFT_START for "Flexible"/
    unrecognized/blank) plus that day's grace window — 11 minutes under v1.1,
    20 minutes from 22 Sept 2026 (LATE_GRACE_MINUTES_V2)."""
    start = SHIFT_START_BY_TIME_SLOT.get(time_slot, DEFAULT_SHIFT_START)
    minutes = LATE_GRACE_MINUTES_V2 if late_policy_v2_active(day) else LATE_GRACE_MINUTES
    return (datetime.combine(date(2000, 1, 1), start) + timedelta(minutes=minutes)).time()

# Stay-back policy (Leave & Attendance Policy v1.1, section 4): a late FINISH
# the prior day earns a later grace THE FOLLOWING day. Three tiers by how late
# the prior shift ran, matching the policy document's own wording (see the
# "Staying back late" list in frontend/src/pages/PolicyDocument.jsx):
# finished past 8:30 PM -> report by 11:00 AM next day; past 10:30 PM ->
# report by 12:00 PM; a shift that runs past MIDNIGHT -> also 12:00 PM
# (detected via MIDNIGHT_TAIL_CUTOFF / _midnight_crossing_dates, since a
# past-midnight clock-out buckets into the next calendar day). A past-midnight
# finish is a grace extension, NOT a comp-off — comp-off is earned only by
# weekly-off / declared-holiday work (v1.1 section 5).
STAY_BACK_CUTOFF = time(20, 30)       # finished past 8:30 PM -> next day 11:00 AM
STAY_BACK_GRACE = time(11, 0)
STAY_BACK_LATE_CUTOFF = time(22, 30)  # finished past 10:30 PM -> next day 12:00 PM
MIDNIGHT_GRACE = time(12, 0)          # ran past midnight -> next day 12:00 PM
# Punches are bucketed by IST calendar date (group_punches_by_day), not by
# shift — a clock-out after midnight lands in the NEXT day's bucket instead
# of staying attached to the shift that earned it. A first punch before this
# hour is never a genuine fresh arrival for this company's shifts (earliest
# is 10 AM) — it's the tail of the PRIOR day's overnight finish.
MIDNIGHT_TAIL_CUTOFF = time(6, 0)

# Declared half-days (10 AM-3 PM only) on which NO Comp-Off is earned even
# though the day is a holiday (HR, 19 Nov 2026: 25 Sep 2026).
COMP_OFF_EXCLUDED_DATES = {date(2026, 9, 25)}

# Late-night comp-off (HR instruction, 25 Nov 2026): corporate staff whose shift runs to 12:30 AM or
# later (the real clock-out lands in the next calendar day's punch bucket) earn 1 day of Comp-Off,
# credited to the day the shift STARTED. Work that ends between midnight and 12:30 AM earns only
# the later next-day arrival time.
MIDNIGHT_COMP_OFF_AFTER = time(0, 30)

# Non-OT employees on this time slot have a shortened Saturday. OT-eligible
# employees work their usual assigned shift on Saturdays as on weekdays.
SATURDAY_SHIFT_HOURS = {
    "10:00 AM – 6:30 PM": 5.0,
}

# HR policy, 25 Sept 2026: some time_slots grade OT off a fixed clock
# cutoff instead of hours worked
# past standard_hours_per_day — e.g. the "10:00 AM – 7:40 PM" slot's OT
# starts strictly after 7:00 PM regardless of standard_hours_per_day. A
# time_slot not listed here keeps the hours-past-standard rule below.
WEEKDAY_OT_CUTOFF_BY_TIME_SLOT = {
    "10:00 AM – 7:40 PM": time(19, 0),
}

# Company policy: OT is only payable to employees whose base gross (Basic +
# HRA + Conveyance, the same figure OT is already priced off of below) is at
# or below this ceiling — anyone earning more than this has no OT hours/
# amount at all, regardless of hours actually worked past standard time.
OT_ELIGIBLE_GROSS_CEILING = 25000.0


def _is_ot_eligible(employee: dict) -> bool:
    if not employee.get("ot_applicable", True):
        return False
    gross = (
        float(employee.get("basic") or 0)
        + float(employee.get("hra") or 0)
        + float(employee.get("conveyance") or 0)
    )
    return gross <= OT_ELIGIBLE_GROSS_CEILING


_SLOT_RANGE_RE = re.compile(
    r"(\d{1,2}):(\d{2})\s*([AP]M)\s*[\u2013\u2014-]\s*(\d{1,2}):(\d{2})\s*([AP]M)", re.IGNORECASE
)


def _slot_times(time_slot: str | None) -> tuple[time, time] | None:
    """(start, end) parsed from a label like "10:00 AM – 7:00 PM" (also
    "Intern (10:00 AM – 6:00 PM)"). None for "Flexible"/blank/unparseable."""
    m = _SLOT_RANGE_RE.search(time_slot or "")
    if not m:
        return None

    def _t(h: str, mi: str, ap: str) -> time:
        hh = int(h) % 12 + (12 if ap.upper() == "PM" else 0)
        return time(hh, int(mi))

    return _t(*m.group(1, 2, 3)), _t(*m.group(4, 5, 6))


def _slot_shift_hours(time_slot: str | None) -> float | None:
    """Assigned shift length (end - start) for the employee's time_slot."""
    t = _slot_times(time_slot)
    if not t:
        return None
    return (datetime.combine(date(2000, 1, 1), t[1]) - datetime.combine(date(2000, 1, 1), t[0])).total_seconds() / 3600.0


def _standard_hours_for_day(
    d: date, standard_hours_per_day: float, time_slot: str | None, ot_eligible: bool = True
) -> float:
    if d.weekday() == 5 and not ot_eligible and time_slot in SATURDAY_SHIFT_HOURS:
        return SATURDAY_SHIFT_HOURS[time_slot]
    # The employee's assigned shift IS their standard day: a 10-7 employee
    # (9h) must not be graded against the generic 8h default, or every day
    # shows an hour of phantom overtime.
    slot_hours = _slot_shift_hours(time_slot)
    if slot_hours and time_slot != FLEXIBLE_TIME_SLOT:
        return slot_hours
    return standard_hours_per_day


def _ot_hours(d: date, start: datetime, end: datetime, day_standard: float, time_slot: str | None = None) -> float:
    """OT begins after the usual shift on every day, including Saturday.

    Assigned time slots use their shift-end clock cutoff (including the
    explicit 7:40 PM slot exception). Flexible or missing slots use worked
    hours beyond the employee's standard day.
    """
    weekday_cutoff = WEEKDAY_OT_CUTOFF_BY_TIME_SLOT.get(time_slot)
    if weekday_cutoff is None and time_slot != FLEXIBLE_TIME_SLOT:
        # Any other assigned shift: OT starts only after the shift's own end.
        slot = _slot_times(time_slot)
        weekday_cutoff = slot[1] if slot else None
    if weekday_cutoff is not None:
        cutoff = datetime.combine(d, weekday_cutoff, tzinfo=IST)
        return max(0.0, (end - max(start, cutoff)).total_seconds() / 3600.0)
    hours_worked = max(0.0, (end - start).total_seconds() / 3600.0)
    return max(0.0, hours_worked - day_standard)


def pay_period_bounds(year: int, month: int, calendar_month: bool = False) -> tuple[date, date]:
    """Pay period labeled (year, month) runs 23rd of the prior month
    through the 22nd of (year, month). With calendar_month=True it instead
    spans the true calendar month (1st through last day) — the ESIC report is
    a calendar-month statutory return, not the 23rd–22nd payroll cycle."""
    if calendar_month:
        last_day = calendar.monthrange(year, month)[1]
        return date(year, month, 1), date(year, month, last_day)
    if month == 1:
        prev_year, prev_month = year - 1, 12
    else:
        prev_year, prev_month = year, month - 1
    start = date(prev_year, prev_month, 23)
    end = date(year, month, 22)
    return start, end


def days_in_month(year: int, month: int, calendar_month: bool = False) -> int:
    """Number of days in the pay period. Name kept for call-site compatibility."""
    start, end = pay_period_bounds(year, month, calendar_month)
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


# Stores whose staff ALL follow the store's holiday calendar (HR, 24 Nov 2026,
# Pedder Road): a "closed" day is a paid H for everyone there — retail staff
# included, and even if they punched or HR corrected the day — and on an
# "open till 4pm" day staff who did not work lose half a day. Everywhere else
# closed holidays still apply to the corporate roster only (see
# is_closed_holiday below). Matched as a substring of hr_employees.location.
HOLIDAY_ALL_STAFF_LOCATIONS = ("pedder road",)


def holiday_applies_to_all_staff(employee_location: str | None) -> bool:
    loc = (employee_location or "").lower()
    return any(name in loc for name in HOLIDAY_ALL_STAFF_LOCATIONS)


# From the Nov 2026 pay cycle (23 Oct onward). Earlier, already-paid cycles keep
# the deductions they were paid with.
DISPUTE_FULL_DAY_EFFECTIVE = date(2026, 10, 23)


def _normalize_override_out_time(override: dict) -> dict:
    """Employees type a dispute's clock-out on a 12-hour clock: "07:00" for
    7 PM, "05:00" for 5 PM (Sagar Pawar's Nov 2026 disputes). Stored as-is it
    lands before the clock-in, and the day shows 0 hours. A same-day clock-out
    earlier than the clock-in, that becomes later than it with 12 hours added,
    is read as PM. A genuine past-midnight finish carries last_out_date and is
    left alone."""
    first_in, last_out = override.get("first_in"), override.get("last_out")
    if not last_out or override.get("register"):
        return override
    if override.get("last_out_date") and str(override["last_out_date"])[:10] != str(override.get("date") or "")[:10]:
        return override
    if last_out.hour >= 12 or not first_in or last_out > first_in:
        return override
    if last_out.hour == 0:
        # "00:15" is a finish just after midnight (next calendar day), never 12:15 PM.
        return {**override, "last_out_date": _next_day_iso(override), "last_out_read_as_next_day": True}
    pm = last_out.replace(hour=last_out.hour + 12)
    if first_in < pm:
        return {**override, "last_out": pm, "last_out_read_as_pm": True}
    return override


def _next_day_iso(override: dict) -> str | None:
    d = override.get("date")
    return (date.fromisoformat(str(d)[:10]) + timedelta(days=1)).isoformat() if d else None


def _fill_override_from_punches(override: dict, punches: list[datetime]) -> dict:
    """An approved "forgot to clock in/out" correction carries only the side the
    employee claimed, and the override replaces the whole day — so the real
    punch on the other side used to vanish from the sheet (and from lateness /
    hours / OT). Keep it: when exactly one side of a present-day correction is
    missing, take it from the day's raw biometric punches, if they have one on
    the sensible side of the corrected time."""
    if override.get("register") or override.get("status_override") != "present":
        return override
    override = _normalize_override_out_time(override)
    if not punches:
        return override
    first_in, last_out = override.get("first_in"), override.get("last_out")
    if first_in and last_out:
        return override
    if not (first_in or last_out):
        # Approved with no times (e.g. "worked till past midnight"): the day
        # was confirmed present, so keep the real punches instead of a blank day.
        if len(punches) >= 2:
            return {**override, "first_in": punches[0].astimezone(IST).time(), "last_out": punches[-1].astimezone(IST).time()}
        return {**override, "first_in": punches[0].astimezone(IST).time()}
    if last_out and not first_in:
        raw = punches[0].astimezone(IST).time()
        if raw < last_out:
            return {**override, "first_in": raw}
        if last_out.hour == 0:
            return {**override, "first_in": raw, "last_out_date": _next_day_iso(override), "last_out_read_as_next_day": True}
        pm = last_out.replace(hour=last_out.hour + 12) if last_out.hour < 12 else None
        if pm and raw < pm:
            # "Forgot to clock out at 07:00" with a 10:15 clock-in means 7 PM.
            return {**override, "first_in": raw, "last_out": pm, "last_out_read_as_pm": True}
    elif first_in and not last_out:
        raw = punches[-1].astimezone(IST).time()
        if raw > first_in:
            return {**override, "last_out": raw}
    return override


def _apply_override(
    d: date, override: dict, standard_hours_per_day: float,
    time_slot: str | None = None, ot_eligible: bool = True,
) -> dict:
    reg = override.get("register")
    if reg:
        # An imported register day (hr_attendance_register): shown and paid
        # exactly as the sheet has it. register_credit is the payable credit.
        iso = lambda t: datetime.combine(d, t, tzinfo=IST).isoformat() if t else None
        return {
            "date": d.isoformat(),
            "first_in": iso(override.get("first_in")),
            "last_out": iso(override.get("last_out")),
            "hours_worked": reg["work_hours"],
            "ot_hours": reg["ot_hours"],
            "status": override["status_override"],
            "late": reg["late_count"] is not None,
            "late_half_day_tier": False,
            "corrected": True,
            "register_credit": reg["credit"],
            "register_late_count": reg["late_count"] or 0,
            "register_shift": reg["shift_code"],
        }
    status = override["status_override"]
    first_in, last_out = override.get("first_in"), override.get("last_out")
    day_standard = _standard_hours_for_day(d, standard_hours_per_day, time_slot, ot_eligible)

    hours_worked = ot_hours = extra_hours = 0.0
    first_in_iso = last_out_iso = None
    late = False
    grace = _late_grace_for(time_slot, d)
    is_flexible = time_slot == FLEXIBLE_TIME_SLOT
    if status == "present" and first_in and last_out:
        start = datetime.combine(d, first_in, tzinfo=IST)
        out_day = d
        if override.get("last_out_date"):
            out_day = date.fromisoformat(str(override["last_out_date"])[:10])
            if out_day < d:
                out_day = d
        end = datetime.combine(out_day, last_out, tzinfo=IST)
        hours_worked = max(0.0, (end - start).total_seconds() / 3600.0)
        ot_hours = _ot_hours(d, start, end, day_standard, time_slot)
        extra_hours = _extra_hours_after_shift(d, start, end, time_slot, ot_eligible)
        first_in_iso, last_out_iso = start.isoformat(), end.isoformat()
        late = (hours_worked < day_standard) if is_flexible else (first_in > grace)
    elif status == "present":
        # Only one side (or neither) of the punch was corrected — a "forgot to
        # clock in/out" dispute usually fills just one time. Still surface the
        # time that WAS entered instead of dropping both to null; credit the
        # standard day's hours (OT needs both punches to measure a span, so it
        # stays 0 until the other side is also filled).
        hours_worked = day_standard
        if first_in:
            first_in_iso = datetime.combine(d, first_in, tzinfo=IST).isoformat()
            late = first_in > grace and not is_flexible
        if last_out:
            last_out_iso = datetime.combine(d, last_out, tzinfo=IST).isoformat()
    elif status == "half_day":
        hours_worked = day_standard / 2

    # An HR-corrected punch has to be graded on the same arrival-time tier as
    # a biometric one — this path set no tier flag at all before the Sept 2026
    # revision, so a corrected 11:30 AM arrival would otherwise price at v2's
    # cheaper ¼-day tier than the identical raw punch.
    #
    # Deliberately NOT setting after_noon here: that flag is consumed only by
    # the v1.1 branch of apply_late_coming_policy, so populating it now would
    # retroactively add a ½-day LOP to already-issued pre-revision payslips
    # for anyone whose after-noon arrival was entered as a correction.
    corrected_in = first_in if status == "present" else None
    return {
        "date": d.isoformat(),
        "first_in": first_in_iso,
        "last_out": last_out_iso,
        "hours_worked": round(hours_worked, 2),
        "ot_hours": round(ot_hours, 2),
        "extra_hours": round(extra_hours, 2),
        "status": status,
        "late": late,
        "late_half_day_tier": bool(corrected_in and corrected_in >= LATE_HALF_DAY_CUTOFF_V2),
        "corrected": True,
        **({"last_out_read_as_pm": True} if override.get("last_out_read_as_pm") else {}),
        **({"last_out_next_day": True} if override.get("last_out_read_as_next_day") else {}),
        # Approved dispute (HR, 28 Nov 2026): the day counts as a full day on the
        # employee's time slot: no late band or late deduction, remark 1.
        **({"dispute_approved": True} if override.get("from_dispute") and status == "present"
           and d >= DISPUTE_FULL_DAY_EFFECTIVE else {}),
    }


# Extra-hours late allowance (HR, 23 Nov 2026): working past the shift one day
# buys time the next morning at 2:1 — every 2 hours of extra work allows 1 hour
# of late arrival. 2h30m extra -> 1h15m allowed. It is not banked: it covers
# only the very next working day, and a late arrival inside it is not a late
# mark. Arriving later than the allowance still counts as late as usual.
EXTRA_HOURS_PER_ALLOWED_HOUR = 2.0


def _shift_end_for_day(d: date, time_slot: str | None, ot_eligible: bool) -> time | None:
    """Clock time the assigned shift ends on `d`. A shortened Saturday
    (SATURDAY_SHIFT_HOURS, non-OT staff) ends start + those hours, e.g. 3 PM."""
    slot = _slot_times(time_slot)
    if time_slot == FLEXIBLE_TIME_SLOT or slot is None:
        return None
    if d.weekday() == 5 and not ot_eligible and time_slot in SATURDAY_SHIFT_HOURS:
        return (datetime.combine(date(2000, 1, 1), slot[0]) + timedelta(hours=SATURDAY_SHIFT_HOURS[time_slot])).time()
    return slot[1]


def _extra_hours_after_shift(
    d: date, start: datetime, end: datetime, time_slot: str | None, ot_eligible: bool,
) -> float:
    """Hours worked past the shift's own end that day. Independent of OT pay
    eligibility: it only feeds the next-day late allowance."""
    shift_end = _shift_end_for_day(d, time_slot, ot_eligible)
    if shift_end is None:
        return 0.0
    cutoff = datetime.combine(d, shift_end, tzinfo=IST)
    return round(max(0.0, (end - max(start, cutoff)).total_seconds() / 3600.0), 2)


def _previous_working_row(rows: list[dict], d: date) -> dict | None:
    """The last row before `d` that was a working day, stepping back over
    weekly offs and company holidays that were not worked. "The very next
    working day" after a Saturday is Monday when Sunday is the weekly off
    (HR, 28 Nov 2026: Rushikesh Chande, 14 -> 16 Nov)."""
    for r in reversed(rows):
        if date.fromisoformat(r["date"]) >= d:
            continue
        if r.get("status") in ("weekoff", "holiday"):
            continue
        return r
    return None


def _extra_hours_late_allowance_minutes(
    prev_row: dict | None, d: date, weekly_off_day: int, time_slot: str | None, holidays: dict,
) -> int:
    # Only for an assigned shift: its extra time is counted from the shift end.
    # With no/unknown slot, "OT" is measured against a generic 8h day and would
    # hand out phantom allowances to anyone working a normal 9h day.
    if time_slot == FLEXIBLE_TIME_SLOT or _slot_times(time_slot) is None or d.weekday() == weekly_off_day:
        return 0
    if not prev_row:
        return 0
    prev_day = date.fromisoformat(prev_row["date"])
    if (d - prev_day).days > 7:
        return 0
    if prev_row.get("status") != "present" or prev_row.get("worked_on_weekly_off"):
        return 0
    if prev_day in holidays:
        return 0
    extra = float(prev_row.get("extra_hours", prev_row.get("ot_hours")) or 0.0)
    return int(extra * 60 / EXTRA_HOURS_PER_ALLOWED_HOUR)


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


def _stay_back_extension_for(
    d: date, by_day: dict[date, list[datetime]], midnight_tail_dates: set[date],
) -> time | None:
    """Just the stay-back-earned grace extension (v1.1 section 4 / v3 doc
    §20-21) for day `d` — None if the prior day didn't earn one. Split out of
    _extended_grace_for so Policy v3's banding (which has NO blanket grace-
    minutes addition of its own, only this extension) can reuse the exact
    same stay-back detection without duplicating it."""
    prior = d - timedelta(days=1)
    if prior in midnight_tail_dates:
        return MIDNIGHT_GRACE
    prior_punches = by_day.get(prior, [])
    if not prior_punches:
        return None
    finished = prior_punches[-1].astimezone(IST).time()
    if finished > STAY_BACK_LATE_CUTOFF:
        return MIDNIGHT_GRACE
    if finished > STAY_BACK_CUTOFF:
        return STAY_BACK_GRACE
    return None


def _extended_grace_for(
    d: date, by_day: dict[date, list[datetime]], midnight_tail_dates: set[date], time_slot: str | None = None,
) -> time:
    """Late-grace cutoff for day `d`, extended if the PRIOR calendar day's
    shift ran late enough to earn it (stay-back policy above). A prior shift
    that ran past midnight earns the 12:00 PM grace; one that merely finished
    past 8:30 PM earns 11:00 AM; otherwise this employee's own shift-derived
    grace (see _late_grace_for — 10:11 AM under v1.1 / 10:20 AM from 22 Sept
    2026 for the standard 10 AM shift, later for a later time_slot)."""
    extension = _stay_back_extension_for(d, by_day, midnight_tail_dates)
    return extension if extension else _late_grace_for(time_slot, d)


# Leave-type labels treated as Paid Leave for the weekly-off earning rule
# below — mirrors leave.py's MERGED_PAID_LEAVE_TYPES. Duplicated (not
# imported) because leave.py already imports from this module, and Python
# can't resolve the resulting circular import.
_PAID_LEAVE_LIKE_TYPES = {"paid", "casual", "sick", "earned"}

# _apply_weekly_off_earning_rule looks 6 days back from each weekoff. A
# weekoff in the first ~6 days of a pay period/range needs visibility into
# the PRIOR period's attendance to be judged correctly — otherwise it's
# silently starved of data and misjudged as unearned (2026-07-26 Jagdish
# Kantilal Sain case: a genuine Sunday weekoff with 5 of 6 real prior days
# present got flipped to "absent" because only 3 of those days fell inside
# the new pay period). compute_daily_attendance below builds rows starting
# this many days before the requested/period start so the rule always has
# a full 6-day window to look at, then trims the extra lookback-only rows
# before returning — callers must fetch punch/leave/override data starting
# this many days early too (see routers/payroll.py, routers/leave.py).
WEEKOFF_LOOKBACK_DAYS = 6


def _apply_weekly_off_earning_rule(rows: list[dict]) -> None:
    """PL & Weekly-Off rule: a weekly-off day is only automatically paid if,
    over the 6 days before it, the employee was EITHER (a) on Paid Leave
    every one of those days — in which case the weekly-off itself also
    counts as Paid Leave, matching how the week reads on the leave ledger —
    or (b) actually present (or on a company holiday, or on a confirmed WFH day — doc §25 pays WFH
    like a working day, so it must count toward earning the week's off too,
    same as a real in-office day) at least 3 of those days, in which case it
    stays a normal paid weekoff (unchanged from before this rule existed).
    Any other mix means the weekly-off was not earned and becomes unpaid
    (absent) that week.

    Mutates `rows` in place; only ever touches rows currently "weekoff", and
    leaves a week alone entirely if it isn't fully known yet (contains a
    "future" day) — the judgment can't be made until the week has happened.
    """
    by_date = {date.fromisoformat(r["date"]): r for r in rows}
    for d, row in by_date.items():
        if row["status"] != "weekoff" or row.get("register_credit") is not None or row.get("corrected"):
            continue
        week_days = [d - timedelta(days=i) for i in range(1, 7)]
        week_rows = [by_date[wd] for wd in week_days if wd in by_date]
        if not week_rows or any(r["status"] == "future" for r in week_rows):
            continue
        if all(r["status"] == "leave" and r.get("leave_type") in _PAID_LEAVE_LIKE_TYPES for r in week_rows):
            row["status"] = "leave"
            row["leave_type"] = "paid"
            row["late"] = False
        elif sum(1 for r in week_rows if r["status"] in ("present", "wfh", "holiday")) >= 3:
            # A company holiday (Diwali, a closed day) is a day the company gave off, so it
            # counts as attended towards earning the week's off. Without this, a week
            # containing two Diwali holidays and two working days showed the Sunday absent
            # (2026-11-15, Dhananjay Singh).
            continue
        else:
            row["status"] = "absent"
            # Lets every screen print "Sunday" beside the absent mark so it is
            # clear this is the unearned weekly off (fewer than 3 days in the
            # office that week), not an ordinary absence — and disputable.
            row["weekoff_forfeited"] = True
            row["weekoff_days_attended"] = sum(1 for r in week_rows if r["status"] in ("present", "wfh"))


NOON = time(12, 0)

# v2 (w.e.f. 22 Sept 2026) deduction tiers for a CHARGEABLE late mark — i.e.
# one beyond the 3-late Yellow Card allowance. Arriving from 11:00 AM onwards
# costs ½ a day; anything earlier than that but past the 10:20 grace costs ¼.
# Under v1.1 the equivalent cutoff was NOON above and the only amount was ½.
LATE_HALF_DAY_CUTOFF_V2 = time(11, 0)


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
    calendar_month: bool = False,
    date_range: tuple[date, date] | None = None,
    ot_eligible: bool = True,
    wfh_days: dict[date, dict] | None = None,
    holiday_all_staff: bool = False,
) -> list[dict]:
    """One row per day in the pay period (23rd of prior month - 22nd of this month),
    or per day in `date_range` (start, end) when given — an arbitrary span
    that overrides the year/month-derived pay-period bounds, for on-demand
    attendance lookups that aren't tied to a payroll cycle.

    `overrides` (keyed by date) are admin-approved corrections — e.g. from an
    employee's "I forgot to punch out" dispute — and take priority over raw
    punch data for that day. `leaves` (date -> leave_type) are approved leave
    requests; a day with no punches falls back to "leave" instead of "absent"
    when one covers it.

    `wfh_days` (date -> the hr_wfh_requests row) are Policy v3 §24-25 Work
    From Home days that are BOTH approved AND had their completed work
    confirmed — the caller (routers/wfh.py's fetch helpers) is responsible
    for only including dates that pass both gates; this function trusts the
    dict as final. Ranks below an admin override (a correction always wins)
    but above leave/punches — an employee physically present that day or one
    who separately filed leave should still show as "wfh", since the
    approved+confirmed WFH record is the authoritative account of that day. `weekly_off_day` follows date.weekday() (0=Mon..6=Sun,
    default Sunday) and is set per-employee for staff with a rotational off.

    `holidays` and `is_corporate` implement the corporate-roster-only Leave &
    Attendance Policy v1.1: a 'closed' company holiday is paid like a weekoff
    instead of showing absent, and a present day landing on a weekoff/closed
    holiday is flagged comp-off eligible (v1.1 section 5 — the only way to earn
    a comp-off). A prior day whose shift ran past 8:30 PM / past midnight
    instead extends THIS day's late grace to 11 AM / 12 PM (v1.1 section 4 —
    see _extended_grace_for / MIDNIGHT_TAIL_CUTOFF; a past-midnight finish is a
    grace extension, never a comp-off). Late-mark/Red-Card/LOP-by-lateness is
    cross-day cycle state, computed in compute_monthly_summary instead.

    `ot_eligible=False` (see _is_ot_eligible — gross > OT_ELIGIBLE_GROSS_CEILING,
    or the employee's own ot_applicable flag is off) zeroes every day's
    ot_hours after the fact, rather than skipping the OT calc per-day —
    simpler and applies uniformly whether the day came from a raw punch span
    or an admin override.
    """
    overrides = overrides or {}
    leaves = leaves or {}
    holidays = holidays or {}
    wfh_days = wfh_days or {}
    by_day = group_punches_by_day(punch_times)
    midnight_tail_dates = _midnight_crossing_dates(by_day)
    start, end = date_range if date_range else pay_period_bounds(year, month, calendar_month)
    today = datetime.now(IST).date()

    # Build from WEEKOFF_LOOKBACK_DAYS before `start` so the weekly-off
    # earning rule below always has a full 6-day lookback available, even
    # for a weekoff that falls in the first few days of the range — see
    # WEEKOFF_LOOKBACK_DAYS's comment. These extra lead-in rows are trimmed
    # off before returning; they exist only to feed that rule.
    fetch_start = start - timedelta(days=WEEKOFF_LOOKBACK_DAYS)

    rows = []
    d = fetch_start
    while d <= end:
        store_holiday = holidays.get(d) if holiday_all_staff else None
        is_register_day = bool(overrides.get(d, {}).get("register"))  # imported register is authoritative
        if store_holiday and not is_register_day and store_holiday.get("day_type") in ("closed", "day_off"):
            # Store closed: paid holiday for every employee of this store,
            # whatever they punched and whatever was corrected.
            rows.append({
                "date": d.isoformat(),
                "first_in": None,
                "last_out": None,
                "hours_worked": 0.0,
                "ot_hours": 0.0,
                "status": "future" if d > today else "holiday",
                "late": False,
                **({"holiday_description": store_holiday["description"]} if d <= today else {}),
            })
            d += timedelta(days=1)
            continue

        if d in overrides:
            day_punches = by_day.get(d, [])
            if day_punches and day_punches[0].astimezone(IST).time() < MIDNIGHT_TAIL_CUTOFF:
                day_punches = day_punches[1:]  # tail of yesterday's shift, same rule as raw days below
            override = _fill_override_from_punches({"date": d.isoformat(), **overrides[d]}, day_punches)
            if (d in midnight_tail_dates and not overrides[d].get("last_out") and not override.get("register")
                    and override.get("status_override") == "present" and override.get("first_in")):
                # Approved day whose real finish was after midnight: the clock-out sits in tomorrow's bucket.
                tail = [p for p in by_day.get(d + timedelta(days=1), []) if p.astimezone(IST).time() < MIDNIGHT_TAIL_CUTOFF]
                if tail:
                    override = {**override, "last_out": max(tail).astimezone(IST).time(),
                                "last_out_date": (d + timedelta(days=1)).isoformat()}
            row = _apply_override(d, override, standard_hours_per_day, time_slot, ot_eligible)
            if row["status"] == "present" and d.weekday() == weekly_off_day and not override.get("register"):
                # A corrected day on the weekly off is still WOP: no late mark,
                # Yellow Card or deduction (HR, 17 Nov 2026), same as a raw punch.
                row["worked_on_weekly_off"] = True
                row["late"] = False
                row["late_half_day_tier"] = False
            rows.append(row)
            d += timedelta(days=1)
            continue

        if d in wfh_days:
            # Doc §25: 50% pay, contingent on the Reporting Manager's
            # completion confirmation — the caller only puts a date in this
            # dict once both that and the Senior-Mgmt/HR-Head approval have
            # happened, so this branch never itself checks work_completed.
            # Never late/absent-flagged and carries no lop_days; the actual
            # 0.5-pay effect is applied in compute_monthly_summary the same
            # way a "half_day" status already is.
            rows.append({
                "date": d.isoformat(),
                "first_in": None,
                "last_out": None,
                "hours_worked": 0.0,
                "ot_hours": 0.0,
                "status": "wfh",
                "late": False,
            })
            d += timedelta(days=1)
            continue

        # Approved leave wins over a stray punch — an employee badging in/out
        # once on an approved-leave day (e.g. dropping by the office) must
        # still show as leave and consume PL, not silently flip to "present"
        # and mask the approval. Checked ahead of punches for exactly that
        # reason; only an admin override (above) can supersede it.
        if d in leaves and leaves[d] == "half_day":
            # Approved Half Day leave: reuses the "half_day" status so the
            # monthly summary pays 0.5 and books 0.5 without-pay.
            rows.append({
                "date": d.isoformat(),
                "first_in": None,
                "last_out": None,
                "hours_worked": 0.0,
                "ot_hours": 0.0,
                "status": "half_day",
                "leave_type": "half_day",
                "late": False,
            })
            d += timedelta(days=1)
            continue

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

        punches = by_day.get(d, [])
        # A first punch before MIDNIGHT_TAIL_CUTOFF isn't a fresh arrival —
        # it's the tail of YESTERDAY's shift, misfiled into today's bucket
        # by pure calendar-date grouping. Drop it so it can't masquerade as
        # today's first_in (and, e.g., zero out today's hours_worked).
        if punches and punches[0].astimezone(IST).time() < MIDNIGHT_TAIL_CUTOFF:
            punches = punches[1:]
        is_closed_holiday = is_corporate and holidays.get(d, {}).get("day_type") in ("closed", "day_off")

        if not punches:
            if d > today:
                status = "future"
            elif is_closed_holiday:
                status = "holiday"
            elif d.weekday() == weekly_off_day:
                status = "weekoff"
            elif holiday_all_staff and holidays.get(d, {}).get("day_type") == "open_till_4pm":
                # Store trades half a day: the company pays the day in full to
                # whoever worked it; anyone who did not (and has no approved
                # leave — that branch ran earlier) loses half a day.
                status = "half_day"
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
            elif status == "half_day":
                row["holiday_description"] = holidays[d]["description"]
                row["half_day_holiday"] = True
            rows.append(row)
            d += timedelta(days=1)
            continue

        first_in = punches[0]
        last_out = punches[-1]
        day_standard = _standard_hours_for_day(d, standard_hours_per_day, time_slot, ot_eligible)
        hours_worked = max(0.0, (last_out - first_in).total_seconds() / 3600.0)
        ot_hours = _ot_hours(d, first_in, last_out, day_standard, time_slot)
        first_in_local = first_in.astimezone(IST).time()

        row = {
            "date": d.isoformat(),
            "first_in": first_in.isoformat(),
            "last_out": last_out.isoformat(),
            "hours_worked": round(hours_worked, 2),
            "ot_hours": round(ot_hours, 2),
            "status": "present",
            # Never late on the employee's own weekly off (WOP): coming in on a
            # day off carries no late mark, card or deduction (HR, 17 Nov 2026).
            "late": d.weekday() != weekly_off_day and (
                hours_worked < day_standard
                if time_slot == FLEXIBLE_TIME_SLOT
                else first_in_local > _extended_grace_for(d, by_day, midnight_tail_dates, time_slot)
            ),
            # Always computed, regardless of employee_category — unlike
            # comp_off_eligible below (corporate-only, and about actual
            # comp-off entitlement), this only flags "they clocked in on their
            # declared weekly off" for display (the attendance sheet shows
            # WOP instead of a bare P), which every employee needs, factory/
            # retail included — HR flagged that a Sunday punch was reading as
            # plain Present with no indication it was their weekoff at all.
            "worked_on_weekly_off": d.weekday() == weekly_off_day,
        }
        # Night work: a clock-out after midnight is bucketed under the NEXT calendar day, so this shift looked
        # like it ended at its last same-day punch. Take the real clock-out from the early-morning punches of the
        # next day, so the sheet shows it and hours and overtime run to the true finish.
        if d in midnight_tail_dates:
            tail = [p for p in by_day.get(d + timedelta(days=1), []) if p.astimezone(IST).time() < MIDNIGHT_TAIL_CUTOFF]
            if tail and max(tail) > first_in:
                last_out = max(tail)
                hours_worked = max(0.0, (last_out - first_in).total_seconds() / 3600.0)
                ot_hours = _ot_hours(d, first_in, last_out, day_standard, time_slot)
                row.update({
                    "last_out": last_out.isoformat(), "hours_worked": round(hours_worked, 2), "ot_hours": round(ot_hours, 2),
                    "last_out_next_day": True,
                })
        row["extra_hours"] = _extra_hours_after_shift(d, first_in, last_out, time_slot, ot_eligible)
        prev_row = _previous_working_row(rows, d)
        allowance = _extra_hours_late_allowance_minutes(prev_row, d, weekly_off_day, time_slot, holidays)
        excused = False
        if allowance:
            shift_start = SHIFT_START_BY_TIME_SLOT.get(time_slot, DEFAULT_SHIFT_START)
            allowed_until = (datetime.combine(d, shift_start) + timedelta(minutes=allowance)).time()
            row["late_allowance_minutes"] = allowance
            row["late_allowance_until"] = allowed_until.strftime("%H:%M")
            row["late_allowance_extra_hours"] = prev_row.get("extra_hours", prev_row.get("ot_hours"))
            row["late_allowance_from"] = prev_row["date"]
            # Under v3 any arrival past the shift start is a Yellow Card, so an
            # arrival inside v2's 20-minute grace (row["late"] False) still
            # needs excusing; otherwise v3 bands 10:01-10:20 regardless.
            would_be_late = row["late"] or (is_corporate and late_policy_v3_active(d) and first_in_local > shift_start)
            if would_be_late and first_in_local <= allowed_until:
                row["late"] = False
                row["late_excused_by_extra_hours"] = True
                row["late_minutes_excused"] = int(
                    (datetime.combine(d, first_in_local) - datetime.combine(d, shift_start)).total_seconds() // 60
                )
                excused = True
        if is_corporate:
            row["after_noon"] = first_in_local > NOON
            # v2's ½-day tier (11:00 AM onwards) — flagged here alongside
            # after_noon so apply_late_coming_policy never has to re-parse
            # first_in back out of the row's ISO string.
            row["late_half_day_tier"] = first_in_local >= LATE_HALF_DAY_CUTOFF_V2
            # Comp-off is earned ONLY by working a weekly off or a declared
            # holiday (v1.1 section 5). A past-midnight finish does NOT earn a
            # comp-off — it extends the NEXT day's grace to 12 PM instead
            # (v1.1 section 4, handled in _extended_grace_for), so there is
            # deliberately no midnight branch here.
            if hours_worked > 0 and d not in COMP_OFF_EXCLUDED_DATES and (d.weekday() == weekly_off_day or d in holidays):
                row["comp_off_eligible"] = True
                row["comp_off_units"] = 0.5 if hours_worked <= 4 else 1.0
            # ── Policy v3 (LIVE from 23 Aug 2026 — see LATE_POLICY_V3_EFFECTIVE)
            # additive fields only; nothing above this reads or is affected by them.
            extension = _stay_back_extension_for(d, by_day, midnight_tail_dates)
            row["stay_back_grace_until_v3"] = extension.isoformat() if extension else None
            # Keep the overnight finish visible for attendance review; it
            # does not independently earn credit under the revised SOP.
            if d in midnight_tail_dates:
                tail_punches = by_day.get(d + timedelta(days=1), [])
                tail_time = tail_punches[0].astimezone(IST).time() if tail_punches else None
                row["midnight_tail_punch_time"] = tail_time.isoformat() if tail_time else None
                # Revised SOP: late-night work alone never earns Comp-Off.
                row["comp_off_eligible_v3"] = False
                clock_out = max(
                    (p.astimezone(IST).time() for p in tail_punches if p.astimezone(IST).time() < MIDNIGHT_TAIL_CUTOFF),
                    default=None,
                )
                if is_corporate and clock_out is not None and clock_out >= MIDNIGHT_COMP_OFF_AFTER and d not in COMP_OFF_EXCLUDED_DATES:
                    row["midnight_comp_off"] = True
                    row["midnight_comp_off_clock_out"] = clock_out.isoformat()
        # Revised SOP, applied to the whole roster (HR, 26 Nov 2026): working a closed /
        # Day Off holiday earns Comp-Off for retail and every other non-corporate
        # employee too, not just the corporate roster. Their weekly off stays out: retail
        # and shop-floor rosters rotate, so a Sunday punch is not by itself a day off.
        if (not is_corporate and hours_worked > 0 and d not in COMP_OFF_EXCLUDED_DATES
                and holidays.get(d, {}).get("day_type") in ("closed", "day_off")):
            row["comp_off_eligible"] = True
            row["comp_off_units"] = 0.5 if hours_worked <= 4 else 1.0
        if excused and is_corporate:
            row["after_noon"] = False
            row["late_half_day_tier"] = False
        rows.append(row)
        d += timedelta(days=1)

    _apply_weekly_off_earning_rule(rows)
    rows = [r for r in rows if date.fromisoformat(r["date"]) >= start]
    if not ot_eligible:
        for row in rows:
            row["ot_hours"] = 0.0
    return rows


LATE_FREE_COUNT = 2  # v1.1 §4: first 2 late arrivals in a cycle are free
LATE_LOP_DAYS = 0.5  # ½-day LOP per chargeable late mark (v1.1 §§4,8: deductions only in ½/full-day units)
RED_CARD_LATE_MARKS = 5  # v1.1: 5+ late marks in a cycle is a Red Card

# v2, w.e.f. 22 Sept 2026 (see LATE_POLICY_V2_EFFECTIVE):
#   * the first 3 late arrivals in the cycle are a YELLOW CARD, no deduction —
#     unconditionally, including an arrival after noon (v1.1 charged those
#     even inside the free allowance; the revision does not)
#   * the 4th late mark onward is ¼ day, or ½ day from 11:00 AM onwards
#   * "late beyond 3 times in a month" is a RED CARD, i.e. at 4 late marks
LATE_FREE_COUNT_V2 = 3
LATE_LOP_QUARTER_DAY_V2 = 0.25
LATE_LOP_HALF_DAY_V2 = 0.5
RED_CARD_LATE_MARKS_V2 = 4


def late_policy_params(period_end: date) -> dict:
    """The cycle-level late-policy numbers in force for a pay period ending
    on `period_end` — see LATE_POLICY_V2_EFFECTIVE on why these are gated per
    cycle while the grace/tier are gated per day."""
    if late_policy_v2_active(period_end):
        return {"free_count": LATE_FREE_COUNT_V2, "red_card_at": RED_CARD_LATE_MARKS_V2}
    return {"free_count": LATE_FREE_COUNT, "red_card_at": RED_CARD_LATE_MARKS}


def late_card_status(late_mark_count: int, period_end: date) -> str:
    """The card this many late marks earns in a cycle: "red", "yellow" or
    "none". The Yellow Card only exists from 22 Sept 2026 — a pre-revision
    cycle is never relabelled retrospectively, it stays "none" below the Red
    Card threshold."""
    params = late_policy_params(period_end)
    if late_mark_count >= params["red_card_at"]:
        return "red"
    if late_mark_count > 0 and late_policy_v2_active(period_end):
        return "yellow"
    return "none"


def enforce_ot_full_day(daily: list[dict]) -> None:
    """Company norm: anyone who worked overtime that day completed their full
    assigned shift — never a half day, never a late-coming/LOP deduction."""
    for r in daily:
        if (r.get("ot_hours") or 0) <= 0:
            continue
        if r.get("status") == "half_day":
            r["status"] = "present"
        if r.get("register_credit") is not None and float(r["register_credit"]) < 1:
            r["register_credit"] = 1.0
        r.pop("lop_days", None)


def apply_late_coming_policy(
    daily: list[dict], standard_hours_per_day: float, time_slot: str | None = None
) -> tuple[int, bool]:
    """Corporate-roster-only. Two policy generations, selected as described on
    LATE_POLICY_V2_EFFECTIVE:

    From 22 Sept 2026 (v2): the first 3 late arrivals in the cycle are a
    Yellow Card with no deduction whatsoever; the 4th onward is ¼ day, or
    ½ day when the arrival was at/after 11:00 AM (late_half_day_tier). 4+ late
    marks in the cycle (i.e. "late beyond 3 times") is a Red Card.

    Before that (Leave & Attendance Policy v1.1, section 4):
    the first LATE_FREE_COUNT (2) late arrivals in the cycle are free; from the
    3rd late arrival onward each is a ½-day LOP (LATE_LOP_DAYS). An arrival
    after 12:00 PM (after_noon) is a ½-day LOP regardless of the late-mark
    count — even within the free allowance. Deductions are only ever ½ or full
    day (v1.1 sections 4 & 8), never a quarter, and there is no hours-shortfall
    late rule. 5+ late marks in the cycle is a Red Card, which still blocks
    NEW Paid Leave/Comp-Off *requests* from being self-submitted that cycle
    (see RED_CARD_BLOCKED_TYPES in routers/leave.py) — but an already-approved
    leave day is left alone here: HR approving the request is itself the
    exception-granting step, so a leave already on the books does not get
    silently converted to LOP behind HR's back (previously it did, with no
    warning anywhere in the Leave Approval flow — see the 2026-07 Rushikesh
    Chande case, where an approved Paid Leave turned into unpaid LOP on the
    payslip with no visible cause).

    `standard_hours_per_day`/`time_slot` are retained for call-site
    compatibility (v1.1 has no hours-shortfall late rule) — kept so the two
    callers don't have to change.

    Mutates `daily` in place (tags lop_days) and returns (late_mark_count, red_card).
    """
    if not daily:
        return 0, False
    params = late_policy_params(date.fromisoformat(daily[-1]["date"]))
    free_count = params["free_count"]

    late_ordinal = 0
    for r in daily:
        if r["status"] == "present" and r.get("late"):
            late_ordinal += 1
            v2 = late_policy_v2_active(date.fromisoformat(r["date"]))
            if late_ordinal > free_count:
                if v2:
                    # ¼ day past the 10:20 grace, ½ day from 11:00 AM onwards.
                    r["lop_days"] = (
                        LATE_LOP_HALF_DAY_V2 if r.get("late_half_day_tier") else LATE_LOP_QUARTER_DAY_V2
                    )
                else:
                    r["lop_days"] = LATE_LOP_DAYS
            elif not v2 and r.get("after_noon"):
                # v1.1 only: after-noon is a ½-day LOP even inside the free
                # allowance. v2's Yellow Card carries no deduction at all.
                r["lop_days"] = LATE_LOP_DAYS

    return late_ordinal, late_ordinal >= params["red_card_at"]


# ── Policy v3 — "JADE BY MONICA & KARISHMA: Attendance, Punctuality, Leave &
# WFH Policy" v2.0, supplied 2026-08-25. The source document itself left its
# Effective Date blank ("To be notified") and marked the 0.25/0.50-day pay
# treatments "subject to applicable law and final payroll/legal validation
# before implementation" (doc §34) — LATE_POLICY_V3_EFFECTIVE was therefore
# originally a far-future placeholder while this was built dormant. The user
# explicitly activated it on 2026-08-25 (see the constant below); it is now
# LIVE for every real payroll cycle from 23 Aug 2026 onward. Never move this
# constant again without an equally explicit go-ahead.
#
# v3 replaces v1.1/v2's late-mark-count Red Card with a Yellow/Red Card
# system: EVERY late arrival (even a penalty-free one) earns a Yellow Card;
# 7 Yellow Cards in a cycle earns a Red Card and an Attendance Improvement
# Plan (AIP), not v2's Quarter Red Card/PL-forfeit mechanism (see
# routers/late_policy.py's `in_policy` gating — a cycle governed by v3 is
# excluded from ever completing a Quarter Red Card).
LATE_POLICY_V3_EFFECTIVE = date(2026, 8, 23)  # ACTIVATED per user go-ahead 2026-08-25 — start of the current pay cycle (23 Aug-22 Sep 2026), so this in-progress cycle is governed by v3 from its own first day


def late_policy_v3_active(d: date) -> bool:
    return d >= LATE_POLICY_V3_EFFECTIVE


# Minutes after this employee's OWN shift start (SHIFT_START_BY_TIME_SLOT /
# DEFAULT_SHIFT_START — same per-shift resolution v1.1/v2 already use).
# Unlike v1.1/v2, v3 has NO blanket grace before the very first band: on
# time IS the shift's own start time (doc §4/§8), so there's no analogue to
# LATE_GRACE_MINUTES/_V2 here — only band boundaries.
V3_DAILY_TOLERANCE_END_MIN = 10   # §9:  +1..+10 min  => Daily Tolerance (Yellow, unlimited, no deduction)
V3_EXTENDED_BUFFER_END_MIN = 20   # §10: +11..+20 min => Extended Monthly Buffer (Yellow; first 3/cycle free)
V3_LEVEL1_END_MIN = 45            # §11: +21..+45 min => Level 1 (Yellow + 0.25)
V3_LEVEL2_END_MIN = 105           # §12: +46..+105 min (11:45 - 10:00) => Level 2 (Yellow + 0.25)
# §13: beyond +105 min (11:46 onward) => Level 3 (Yellow + 0.50)

V3_FREE_BUFFER_COUNT = 3          # §10: first 3 Extended-Buffer arrivals/cycle are free
V3_LEVEL_LOP_DAYS = {"level1": 0.25, "level2": 0.25, "level3": 0.5}
V3_YELLOW_CARDS_FOR_RED = 7       # §14: 7 Yellow Cards/cycle => Red Card
V3_AIP_DEFAULT_DAYS = 30          # §15: HR chooses 30 or 60


def _v3_band(minutes_late: float) -> str | None:
    """Which v3 band a `minutes_late` (arrival minus this employee's own
    shift start, already stay-back-extended if applicable) falls in. None =
    on time — not even a Yellow Card."""
    if minutes_late <= 0:
        return None
    if minutes_late <= V3_DAILY_TOLERANCE_END_MIN:
        return "daily_tolerance"
    if minutes_late <= V3_EXTENDED_BUFFER_END_MIN:
        return "extended_buffer"
    if minutes_late <= V3_LEVEL1_END_MIN:
        return "level1"
    if minutes_late <= V3_LEVEL2_END_MIN:
        return "level2"
    return "level3"


def apply_late_coming_policy_v3(daily: list[dict], time_slot: str | None) -> dict:
    """Corporate-roster-only. Mirrors apply_late_coming_policy's job (mutates
    `daily` in place tagging `lop_days`/`late_band_v3`, returns a cycle
    summary) but for the v3 doc's Yellow/Red Card mechanics.

    Reads each present day's own `first_in` directly rather than the v1/v2
    `late` boolean, because v3's on-time cutoff (the bare shift start) is
    stricter than v2's 20-minute grace — a 10:05 arrival is "on time" under
    v2 but already a Yellow Card (Daily Tolerance) under v3. An authorised
    stay-back extension (`stay_back_grace_until_v3`, doc §20/21 — set by
    compute_daily_attendance) still makes an arrival fully on time with no
    card at all, same as v1.1/v2.

    FLEXIBLE_TIME_SLOT employees are exempt from arrival-based banding
    entirely — every other v1.1/v2/v3 caller respects this (see the
    `is_flexible` branch feeding the `late` flag in compute_daily_attendance),
    but this function initially didn't check it at all, silently grading
    Flexible staff against DEFAULT_SHIFT_START (SHIFT_START_BY_TIME_SLOT has
    no entry for "Flexible") as if they had a fixed 10 AM start. Flexible
    staff are judged on completed hours, never on when they walked in, so
    they must never earn a Yellow/Red Card or a lateness LOP here.
    """
    if time_slot == FLEXIBLE_TIME_SLOT:
        return {
            "yellow_card_count": 0, "red_card": False, "daily_tolerance_count": 0,
            "extended_buffer_count": 0, "level1_count": 0, "level2_count": 0, "level3_count": 0,
            "midnight_comp_off_eligible_dates_v3": [r["date"] for r in daily if r.get("comp_off_eligible_v3")],
        }
    shift_start = SHIFT_START_BY_TIME_SLOT.get(time_slot, DEFAULT_SHIFT_START)
    shift_start_dt = datetime.combine(date(2000, 1, 1), shift_start)
    buffer_ordinal = 0
    for r in daily:
        if r["status"] != "present" or not r.get("first_in"):
            continue
        if r.get("worked_on_weekly_off"):
            continue  # WOP: no Yellow Card, band or deduction on a day off
        if r.get("dispute_approved"):
            continue  # approved dispute: a full day on the time slot, no card or deduction
        arrival = datetime.fromisoformat(r["first_in"]).astimezone(IST).time()
        if r.get("late_excused_by_extra_hours"):
            continue  # arrival fell inside the allowance earned by yesterday's extra hours: not late, no card
        grace_until = r.get("stay_back_grace_until_v3")
        if grace_until and arrival <= time.fromisoformat(grace_until):
            continue
        minutes_late = (datetime.combine(date(2000, 1, 1), arrival) - shift_start_dt).total_seconds() / 60
        band = _v3_band(minutes_late)
        if band is None:
            continue
        r["late_band_v3"] = band
        if band == "extended_buffer":
            buffer_ordinal += 1
            if buffer_ordinal > V3_FREE_BUFFER_COUNT:
                r["lop_days"] = V3_LEVEL_LOP_DAYS["level1"]
        elif band in V3_LEVEL_LOP_DAYS:
            r["lop_days"] = V3_LEVEL_LOP_DAYS[band]
        # "daily_tolerance" => Yellow Card only, no deduction, no free-count consumed.

    yellow_cards = sum(1 for r in daily if r.get("late_band_v3"))
    return {
        "yellow_card_count": yellow_cards,
        "red_card": yellow_cards >= V3_YELLOW_CARDS_FOR_RED,
        "daily_tolerance_count": sum(1 for r in daily if r.get("late_band_v3") == "daily_tolerance"),
        "extended_buffer_count": sum(1 for r in daily if r.get("late_band_v3") == "extended_buffer"),
        "level1_count": sum(1 for r in daily if r.get("late_band_v3") == "level1"),
        "level2_count": sum(1 for r in daily if r.get("late_band_v3") == "level2"),
        "level3_count": sum(1 for r in daily if r.get("late_band_v3") == "level3"),
        "midnight_comp_off_eligible_dates_v3": [
            r["date"] for r in daily if r.get("comp_off_eligible_v3")
        ],
    }


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


# Financial-year quarters (India's Apr-Mar year, same convention as
# fy_label_for_month above) — Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar.
FY_QUARTER_MONTHS = {1: (4, 5, 6), 2: (7, 8, 9), 3: (10, 11, 12), 4: (1, 2, 3)}

# Quarter Red Card (w.e.f. 22 Sept 2026): an employee who earns a Red Card in
# EVERY month of a financial-year quarter gets a Final Warning letter and
# forfeits this many Paid Leave days.
QUARTER_RED_CARD_PL_FORFEIT = 2.0


def fy_quarter_for_month(year: int, month: int) -> tuple[str, int]:
    """The financial year and quarter a pay-period label falls in, e.g.
    (2026, 8) -> ('2026-27', 2)."""
    for quarter, months in FY_QUARTER_MONTHS.items():
        if month in months:
            return fy_label_for_month(year, month), quarter
    raise ValueError(f"month out of range: {month}")


def quarter_month_labels(financial_year: str, quarter: int) -> list[tuple[int, int]]:
    """The three pay-period (year, month) labels in an FY quarter — Q4's
    Jan-Mar fall in the FY's SECOND calendar year."""
    if quarter not in FY_QUARTER_MONTHS:
        raise ValueError(f"quarter must be 1-4, got {quarter}")
    start_year = int(financial_year.split("-")[0])
    year = start_year if quarter <= 3 else start_year + 1
    return [(year, m) for m in FY_QUARTER_MONTHS[quarter]]


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


def compute_attendance_for_range(
    employee: dict,
    start: date,
    end: date,
    punch_times: list[datetime],
    overrides: dict[date, dict] | None = None,
    leaves: dict[date, str] | None = None,
    holidays: list[dict] | None = None,
    wfh_days: dict[date, dict] | None = None,
) -> list[dict]:
    """Daily attendance rows for an arbitrary [start, end] span, independent
    of any payroll cycle — used for on-demand attendance lookups (e.g. a
    custom date-range export) rather than a full compute_monthly_summary
    pass, which also runs the late-coming/LOP/PF/ESIC/TDS machinery this
    doesn't need."""
    standard_hours = float(employee.get("standard_hours_per_day") or 8)
    weekly_off_day = int(employee.get("weekly_off_day") if employee.get("weekly_off_day") is not None else 6)
    is_corporate = employee.get("employee_category") == "corporate"
    time_slot = employee.get("time_slot")
    holidays = [h for h in (holidays or []) if h.get("day_type") != "anniversary"]
    holidays_for_employee = _holidays_for_employee(holidays, employee.get("location"))
    daily = compute_daily_attendance(
        start.year, start.month, punch_times, standard_hours, overrides, leaves, weekly_off_day,
        holidays=holidays_for_employee, is_corporate=is_corporate, time_slot=time_slot,
        date_range=(start, end), ot_eligible=_is_ot_eligible(employee), wfh_days=wfh_days,
        holiday_all_staff=holiday_applies_to_all_staff(employee.get("location")),
    )
    if is_corporate:
        # Same "is this day late" answer as the payslip under Policy v3 (band
        # from the shift start). The deduction is a per-cycle count, so a
        # free-form range shows the band and Late mark but no lop_days.
        v3_days = [r for r in daily if late_policy_v3_active(date.fromisoformat(r["date"]))]
        apply_late_coming_policy_v3(v3_days, time_slot)
        for r in v3_days:
            r.pop("lop_days", None)
            if r["status"] == "present":
                r["late"] = bool(r.get("late_band_v3"))
    return daily


def compute_monthly_summary(
    employee: dict,
    year: int,
    month: int,
    punch_times: list[datetime],
    overrides: dict[date, dict] | None = None,
    leaves: dict[date, str] | None = None,
    holidays: list[dict] | None = None,
    monthly_tds: float = 0.0,
    calendar_month: bool = False,
    wfh_days: dict[date, dict] | None = None,
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
        calendar_month=calendar_month, ot_eligible=_is_ot_eligible(employee),
        wfh_days=wfh_days, holiday_all_staff=holiday_applies_to_all_staff(employee.get("location")),
    )

    _, period_end_for_v3 = pay_period_bounds(year, month, calendar_month)
    # Register mode: every day of the period came from an imported register,
    # so the sheet's credits ARE the attendance (no policy engine on top).
    enforce_ot_full_day(daily)
    register_mode = bool(daily) and all(r.get("register_credit") is not None for r in daily)
    v3_active = is_corporate and late_policy_v3_active(period_end_for_v3) and not register_mode
    v3_summary = apply_late_coming_policy_v3(daily, time_slot) if v3_active else None
    if v3_active:
        # Under v3 a day is late exactly when it earned a Yellow Card band
        # (late from the shift start, not v2's 10:20 grace). The row's `late`
        # flag drives the "Late" badge, the dispute button, the attendance
        # sheet, the late digest and late_days/on_time_days — so it must agree
        # with the Yellow Card count and the LOP, or an employee sees a ¼ LOP
        # (or a Red Card) on days that are not marked late at all.
        for r in daily:
            if r["status"] == "present":
                r["late"] = bool(r.get("late_band_v3"))
    if register_mode:
        late_mark_count, red_card = max((r["register_late_count"] for r in daily), default=0), False
    elif v3_active:
        late_mark_count, red_card = v3_summary["yellow_card_count"], v3_summary["red_card"]
    else:
        late_mark_count, red_card = (
            apply_late_coming_policy(daily, standard_hours, time_slot) if is_corporate else (0, False)
        )

    enforce_ot_full_day(daily)  # again: late policies above tag lop_days
    present_days = sum(1 for r in daily if r["status"] == "present")
    absent_days = sum(1 for r in daily if r["status"] == "absent")
    holiday_days = sum(1 for r in daily if r["status"] == "holiday")
    leave_days = sum(1 for r in daily if r["status"] == "leave")
    weekoff_days = sum(1 for r in daily if r["status"] == "weekoff")
    half_days = sum(1 for r in daily if r["status"] == "half_day")
    wfh_day_count = sum(1 for r in daily if r["status"] == "wfh")
    unpaid_leave_days = sum(1 for r in daily if r["status"] == "leave" and r.get("leave_type") == "unpaid")
    late_lop_days = round(sum(r.get("lop_days", 0) for r in daily), 2)
    pl_days = leave_days - unpaid_leave_days
    # A confirmed WFH day (doc §25) is paid the same way a half_day already
    # is — 50% — reusing that exact fractional-day mechanism rather than a
    # new one, per PAY_TREATMENT_PERCENT in routers/wfh.py.
    paid_days = present_days + weekoff_days + holiday_days + pl_days + 0.5 * half_days + 0.5 * wfh_day_count - late_lop_days
    if register_mode:
        paid_days = sum(float(r["register_credit"]) for r in daily)
        late_lop_days = 0.0
    # Payslip "WithoutPayDays" — the complement of paid_days over total_days:
    # full absences, unpaid leave (excluded from pl_days above), the unpaid
    # halves of half-days and WFH days, and late-coming LOP days (already a
    # day-amount, not a count — see LATE_LOP_DAYS).
    without_pay_days = absent_days + unpaid_leave_days + 0.5 * half_days + 0.5 * wfh_day_count + late_lop_days
    if register_mode:
        without_pay_days = max(0.0, len(daily) - paid_days)
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

    total_days = days_in_month(year, month, calendar_month)
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
        pf = compute_pf(basic, pf_gross_limit, bool(employee.get("eps_applicable")), pay_period_bounds(year, month, calendar_month)[0])
    else:
        pf = ZERO_PF

    # PT still runs on gross; ESIC now runs on Basic + DA + Retention only,
    # and only while the full monthly Basic is <= 21,000 (Labour Codes).
    esic_gross_wages = basic + hra + conveyance + other_allowance + monthly_bonus + retention + incentive
    esic = compute_esic(esic_wage_base(basic, retention)) if esic_applies(basic_rate) else ZERO_ESIC
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
    # Informational only — late-coming LOP is already reflected in the
    # reduced `paid_days` used to prorate Basic/HRA/Conveyance/Other
    # Allowance/Incentive above, so it must NOT also be subtracted from
    # gross/total_payable below or it would be double-deducted.
    lop_amount = per_day_salary * late_lop_days

    period_start, period_end = pay_period_bounds(year, month, calendar_month)
    if register_mode:
        late_card = "yellow" if late_mark_count > 0 else "none"
    elif v3_active:
        late_card = "red" if red_card else ("yellow" if late_mark_count > 0 else "none")
    else:
        late_card = late_card_status(late_mark_count, period_end) if is_corporate else "none"

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
        "time_slot": time_slot,
        "flexible_reference_time_slot": employee.get("flexible_reference_time_slot"),
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
        "wfh_days": wfh_day_count,
        "pl_days": pl_days,
        # 2 decimals: v3 deducts in ¼ days, so 25.25 must not show as 25.2.
        "paid_days": round(paid_days, 2),
        "late_days": late_days,
        "on_time_days": on_time_days,
        "late_mark_count": late_mark_count,
        "red_card": red_card,
        # "none" | "yellow" | "red" — the Yellow Card exists only from the
        # 22 Sept 2026 revision (late_card_status) / v3 (every late arrival).
        "late_card": late_card,
        "yellow_card": late_card == "yellow",
        "late_policy_version": 3 if v3_active else (2 if late_policy_v2_active(period_end) else 1),
        # v3-only breakdown (None under v1.1/v2) — see apply_late_coming_policy_v3.
        "late_policy_v3": v3_summary,
        "lop_days": late_lop_days,
        "lop_amount": round(lop_amount, 2),
        "without_pay_days": round(without_pay_days, 2),
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
