# attendance_sync: biometric punch sync

**Job:** Pull punch logs from the SmartOffice biometric server and push them into the HR console so attendance, late marks, OT and payroll days are current.
**Code:** `../../biometric_sync.py`; job `attendance_sync` in `../hrpipe/config.py`
**Schedule (UTC):** 23:00, 04:00, 04:30, 05:00, 05:30, 06:00, 07:00 (the 04:00-06:00 half-hourly runs exist so the late panel sees clock-ins as they happen)
**Console API:** `POST /api/biometric/ingest` (login with the sync account)
**Waits for (hand-off):** nothing (first in the chain)
**Sends (hand-off):** `attendance_synced` with `{inserted, skipped, total, auto_provisioned}`
**Cost:** none (code only).

## Subagents
| subagent | what it does |
|---|---|
| fetcher | calls the SmartOffice `GetDeviceLogs` API for a 3-day lookback; the device is unreachable from this VPS most nights (timeouts, "No route to host") |
| ingester | logs into the console and posts the records; the console inserts new punches and skips duplicates, so re-running is a no-op |
| retry-guard | the pipeline engine: retries every 5 min with backoff after a failure (replaces `watchdog.sh`), up to 36 attempts per slot |

## Rules & failure behaviour
- Idempotent: safe to repeat; a later slot supersedes an earlier one.
- Success = exit 0 and `Sync complete` or `Nothing to push.` in the output.
- A failed night run does not email by itself; freshness is judged by the console's biometric feed (stale over 6h) and raised as one incident after 15 min.
- A 503 "HR database standby is switching" or login timeout is treated as a transient failure and retried.
