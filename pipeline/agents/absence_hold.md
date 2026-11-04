# absence_hold: unapproved-absence salary hold (DISABLED)

**Job:** Find anyone on more than 5 consecutive unapproved absent days, put their salary on hold and email Accounts and HR.
**Code:** `../../absence_hold_notify.py`; job `absence_hold`
**Schedule (UTC):** 08:20, **disabled**: it was not scheduled anywhere before the pipeline, so it stays off until a person decides. Enable with `HRPIPE_ENABLE_ABSENCE_HOLD=1`.
**Console API:** `POST /api/attendance/absence-hold-scan`
**Waits for (hand-off):** `attendance_synced` within 240 min, a fresh biometric and roster feed
**Sends (hand-off):** nothing
**Cost:** none (code only).

## Subagents
| subagent | what it does |
|---|---|
| gate | fresh attendance and roster |
| scanner | the console finds the runs (approved leave and WFH break a run; weekly offs and closed holidays read through) and applies the hold; someone already on hold is skipped |

## Rules & failure behaviour
- Puts salaries on hold: do not enable without the user's explicit go-ahead.
