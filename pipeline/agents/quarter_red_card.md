# quarter_red_card: Quarter Red Card

**Job:** An employee with a Red Card (more than 3 late markings) in every month of a financial-year quarter earns a Final Warning letter and automatic forfeiture of 2 Paid Leave days.
**Code:** `../../quarter_red_card_notify.py`; job `quarter_red_card`
**Schedule (UTC):** 09:00 on 23 Mar, Jun, Sep, Dec (window 15h, 6 attempts, 30 min apart)
**Console API:** `POST /api/late-policy/quarter-red-cards/run` (preview with `?dry_run=true`)
**Waits for (hand-off):** `attendance_synced` within 360 min, a fresh biometric **and** roster feed, and a clean preview
**Sends (hand-off):** nothing (result `{quarter, qualifying, applied}` is recorded)
**Cost:** none (code only).

## Subagents
| subagent | what it does |
|---|---|
| gate | attendance and roster must both be fresh, or it holds (nothing applied) |
| previewer | runs `--dry-run` first; if the preview fails the real run is never attempted |
| applier | runs the real endpoint, which refuses a quarter whose last pay period has not closed (HTTP 400) |

## Rules & failure behaviour
- **Applies a penalty**: never retried after a timeout; a person must check the log.
- No extra approval step has been added (that would change the rule); the user can ask for one.
