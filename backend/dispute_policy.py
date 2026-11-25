"""First-pass policy check for attendance disputes (no model, no network).

Decides, from the dispute itself plus the employee's other disputes, whether it
breaks a written policy rule so clearly that it can be rejected on the spot with
the reason spelled out. Everything else is left for the reviewer: this only ever
REJECTS, never approves, and an auto-rejection is an ordinary rejected dispute —
the employee keeps the one-appeal-per-dispute right, and an appeal is always
settled by a person (see disputes._settle), never by this module.

Rules (each returns a plain-language reason shown to the employee):
  future_date      the day has not happened yet
  late_filing      filed more than MAX_AGE_DAYS after the day it is about —
                   disputes are raised weekly, not saved up for month end
  duplicate        the same person already has a pending/approved dispute for
                   that day (appeals are exempt)
  missing_times    the claimed time(s) a missed-punch dispute depends on are absent
  times_reversed   claimed clock-out is not after the claimed clock-in
  register_entry   the explanation rests on a manual-register entry that is
                   illegible or has been changed — biometric punches are the only
                   source of truth, a register is not accepted as proof

Tunable without a deploy of logic: DISPUTE_MAX_AGE_DAYS env var (default 7).
"""

import os
import re
from datetime import date, datetime, time, timedelta

from config import IST

MAX_AGE_DAYS = int(os.environ.get("DISPUTE_MAX_AGE_DAYS", "7"))

# A register is only a problem when the person says it is hard to read or has
# been altered — merely mentioning the register (the form asks for a photo of
# it) must never trigger a rejection.
_REGISTER_WORDS = re.compile(r"\b(register|registers|entry|entries|timing|timings|handwritten|hand-written|book)\b", re.I)
_ALTERED_WORDS = re.compile(
    r"\b(illegible|unreadable|not readable|can'?t be read|unclear|smudged|overwritten|over-written|overwrote|"
    r"changed|altered|corrected|correction|scratched|cut|cutting|whitener|white ?out|tampered|rewritten|re-written|"
    r"different handwriting|someone else wrote)\b", re.I,
)

RULES = {
    "future_date": "This day has not happened yet.",
    "late_filing": "Attendance disputes must be raised within {days} days of the day they are about, so they are cleared weekly rather than at month end. This one was filed {gap} days after the date.",
    "duplicate": "You already have a dispute for this day that is pending or approved.",
    "missing_times": "A {what} is needed for this kind of dispute and none was given.",
    "times_reversed": "The clock-out time you entered is not after the clock-in time.",
    "register_entry": "Manual register entries that are illegible or have been changed are not accepted as proof. Biometric punches are the only record used for attendance.",
}

_NEEDS_IN = {"missed_clock_in", "both", "late_coming"}
_NEEDS_OUT = {"missed_clock_out", "both"}


def _as_date(v) -> date:
    return v if isinstance(v, date) and not isinstance(v, datetime) else date.fromisoformat(str(v)[:10])


def _as_time(v) -> time | None:
    if not v:
        return None
    return v if isinstance(v, time) else time.fromisoformat(str(v))


def filed_on(created_at) -> date:
    """IST calendar date a dispute was filed (naive/missing -> today)."""
    if not created_at:
        return datetime.now(IST).date()
    dt = created_at if isinstance(created_at, datetime) else datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
    if dt.tzinfo is None:
        return dt.date()
    return dt.astimezone(IST).date()


def evaluate(dispute: dict, other_disputes: list[dict] | None = None, max_age_days: int | None = None) -> dict | None:
    """None = no rule broken (leave it for a reviewer). Otherwise
    {"rule": key, "reason": text} for the FIRST rule broken. `dispute` needs
    date, issue_type, claimed_in/out, reason, appeal_of and created_at (absent
    created_at means 'filed now'). `other_disputes` are the same employee's other
    rows (any date); only same-day pending/approved ones matter."""
    limit = MAX_AGE_DAYS if max_age_days is None else max_age_days
    if dispute.get("appeal_of"):
        return None  # an appeal is the human override path — never auto-rejected
    day = _as_date(dispute["date"])
    filed = filed_on(dispute.get("created_at"))
    issue = dispute.get("issue_type")

    if day > filed:
        return {"rule": "future_date", "reason": RULES["future_date"]}
    gap = (filed - day).days
    if gap > limit:
        return {"rule": "late_filing", "reason": RULES["late_filing"].format(days=limit, gap=gap)}

    for o in other_disputes or []:
        if o.get("id") and o.get("id") == dispute.get("id"):
            continue
        if o.get("appeal_of") or _as_date(o["date"]) != day:
            continue
        if o.get("status") in ("pending", "approved"):
            return {"rule": "duplicate", "reason": RULES["duplicate"]}

    cin, cout = _as_time(dispute.get("claimed_in")), _as_time(dispute.get("claimed_out"))
    if issue in _NEEDS_IN and not cin:
        return {"rule": "missing_times", "reason": RULES["missing_times"].format(what="clock-in time")}
    if issue in _NEEDS_OUT and not cout:
        return {"rule": "missing_times", "reason": RULES["missing_times"].format(what="clock-out time")}
    if cin and cout and cout <= cin:
        return {"rule": "times_reversed", "reason": RULES["times_reversed"]}

    text = dispute.get("reason") or ""
    if _REGISTER_WORDS.search(text) and _ALTERED_WORDS.search(text):
        return {"rule": "register_entry", "reason": RULES["register_entry"]}
    return None


def cutoff_hint(today: date | None = None, max_age_days: int | None = None) -> dict:
    """What the employee form shows: the earliest day still accepted."""
    limit = MAX_AGE_DAYS if max_age_days is None else max_age_days
    today = today or datetime.now(IST).date()
    return {"max_age_days": limit, "earliest_date": (today - timedelta(days=limit)).isoformat(), "today": today.isoformat()}
