"""Duplicate-submit guard for employee-facing create endpoints.

A double-clicked Submit button or a client retry after a slow response sends
the same POST twice. Rather than require clients to mint Idempotency-Keys, the
server treats an identical still-pending request from the same employee made
within DUPLICATE_WINDOW as the same submission and returns the original row.
"""
from datetime import datetime, timedelta, timezone

from database import supabase

DUPLICATE_WINDOW = timedelta(minutes=10)


def find_recent_duplicate(table: str, match: dict) -> dict | None:
    since = (datetime.now(timezone.utc) - DUPLICATE_WINDOW).isoformat()
    q = supabase.table(table).select("*").eq("status", "pending").gte("created_at", since)
    for col, val in match.items():
        q = q.eq(col, val)
    rows = q.order("created_at", desc=True).limit(1).execute().data
    return rows[0] if rows else None
