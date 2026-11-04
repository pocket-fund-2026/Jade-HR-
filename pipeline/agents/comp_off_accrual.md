# comp_off_accrual: comp-off credits

**Job:** Credit compensatory-off for work on a weekly off or declared holiday (0.5 under 4h, else 1.0) and work past 12:30 AM (1.0).
**Code:** `../../comp_off_accrual.py`; job `comp_off_accrual`
**Schedule (UTC):** 08:10 earliest (window 6h)
**Console API:** `POST /api/comp-off/accrual-scan`
**Waits for (hand-off):** `attendance_synced` within the last 240 min, plus the data-readiness gate
**Sends (hand-off):** nothing (result `{credited, already_on_file}` is recorded)
**Cost:** none (code only).

## Subagents
| subagent | what it does |
|---|---|
| gate | attendance must be fresh before anything is credited |
| accrual scan | the console computes entitlements from the attendance engine and writes the ledger (unique per employee and earned date, so a repeat is a no-op) |

## Rules & failure behaviour
- Idempotent in effect (unique ledger key), but treated as a penalty-class job: it needs fresh attendance.
- A held run credits nothing and has no side effects.
