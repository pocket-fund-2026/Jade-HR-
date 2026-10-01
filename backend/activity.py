"""Login / activity tracking for Team Pulse (sql/071). Every write here is
best-effort: a failure to record activity must never fail a login or an
API request, so everything is wrapped and only logged."""

import logging
import os
from datetime import datetime, timedelta, timezone

from database import supabase

logger = logging.getLogger("jade_hr.activity")

IST = timezone(timedelta(hours=5, minutes=30))
# last_seen_at is refreshed at most this often per person, so an active
# session costs one small write every few minutes, not one per request.
SEEN_THROTTLE = timedelta(minutes=5)
# Local testing against the production database sets this so test traffic
# doesn't show up as real people's activity.
DISABLED = os.environ.get("JADE_HR_DISABLE_ACTIVITY") == "1"


def ist_day(dt: datetime) -> str:
    return dt.astimezone(IST).date().isoformat()


def device_label(user_agent: str) -> str:
    ua = (user_agent or "").lower()
    if not ua:
        return ""
    if "ipad" in ua or "tablet" in ua:
        kind = "Tablet"
    elif "mobi" in ua or "iphone" in ua or "android" in ua:
        kind = "Phone"
    else:
        kind = "Desktop"
    if "edg/" in ua:
        browser = "Edge"
    elif "samsungbrowser" in ua:
        browser = "Samsung Internet"
    elif "chrome/" in ua or "crios/" in ua:
        browser = "Chrome"
    elif "firefox/" in ua or "fxios/" in ua:
        browser = "Firefox"
    elif "safari/" in ua:
        browser = "Safari"
    elif "python" in ua or "curl" in ua:
        return "Automated script"
    else:
        browser = "Browser"
    return f"{kind} · {browser}"


def _mark_day(employee_id: str, now: datetime) -> None:
    supabase.table("hr_activity_days").upsert(
        {"employee_id": employee_id, "day": ist_day(now)}, on_conflict="employee_id,day", ignore_duplicates=True,
    ).execute()


def record_login(employee: dict, user_agent: str) -> None:
    if DISABLED:
        return
    try:
        now = datetime.now(timezone.utc)
        supabase.table("hr_employees").update({
            "last_login_at": now.isoformat(),
            "last_seen_at": now.isoformat(),
            "login_count": (employee.get("login_count") or 0) + 1,
        }).eq("id", employee["id"]).execute()
        supabase.table("hr_login_events").insert({
            "employee_id": employee["id"],
            "device": device_label(user_agent),
            "user_agent": (user_agent or "")[:400],
        }).execute()
        _mark_day(employee["id"], now)
    except Exception:
        logger.exception("Could not record login for %s", employee.get("id"))


def touch_seen(employee: dict) -> None:
    """Called from get_current_user with the row it already loaded — no
    extra read. Writes only when last_seen_at is older than SEEN_THROTTLE."""
    if DISABLED:
        return
    try:
        now = datetime.now(timezone.utc)
        last = employee.get("last_seen_at")
        last_dt = datetime.fromisoformat(last) if last else None
        if last_dt and now - last_dt < SEEN_THROTTLE:
            return
        supabase.table("hr_employees").update({"last_seen_at": now.isoformat()}).eq("id", employee["id"]).execute()
        if not last_dt or ist_day(last_dt) != ist_day(now):
            _mark_day(employee["id"], now)
        employee["last_seen_at"] = now.isoformat()
    except Exception:
        logger.exception("Could not update last_seen_at for %s", employee.get("id"))
