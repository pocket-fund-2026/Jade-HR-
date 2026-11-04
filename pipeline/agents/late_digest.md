# late_digest: daily late-arrivals digest

**Job:** Email HR the list of everyone who clocked in late today and each reporting manager their own reportees. Sends nothing on a day with no late arrivals.
**Code:** `../../late_digest_notify.py`; job `late_digest`
**Schedule (UTC):** 06:15 earliest (window 6h, 12 attempts, 5 min apart)
**Console API:** `POST /api/attendance/late-digest`
**Waits for (hand-off):** `attendance_synced` within the last 120 min, plus the console data-readiness gate
**Sends (hand-off):** nothing (result `{late, date, emailed}` is recorded)
**Cost:** none (code only).

## Subagents
| subagent | what it does |
|---|---|
| gate | waits for a fresh attendance hand-off and a fresh biometric feed |
| digest runner | calls the console endpoint, which computes lateness (10:11 grace with stay-back extensions) and emails via Resend |
| retry-guard | replaces `late_digest_watchdog.sh`: retries only an attempt that failed (the 2026-09-12 Vercel 500 case) |

## Rules & failure behaviour
- **Sends email**: not idempotent. Retried only after a provably failed attempt, never after a timeout.
- If today's sync failed, the digest is held and runs right after the sync recovers, instead of reporting stale data.
- Success = exit 0 and `late-digest run finished`.
