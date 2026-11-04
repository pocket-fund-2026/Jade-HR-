# roster_new_joiners: fast new-employee pickup

**Job:** Pick up newly added SmartOffice employees within 15 minutes and heal first-punch placeholder names.
**Code:** `../../employee_roster_sync.py --new-only`; job `roster_new_joiners`
**Schedule (UTC):** every 15 min, 03:00-15:45 (one attempt per slot, next slot is the retry)
**Console API:** same reconcile endpoints as roster_sync
**Waits for (hand-off):** nothing
**Sends (hand-off):** `employees_added` with `{created, updated, deactivated}`, **only when `created` > 0**
**Cost:** none (code only).

## Subagents
| subagent | what it does |
|---|---|
| web-exporter | same SmartOffice export as roster_sync |
| creator | creates new Working employees and heals placeholder names; `--new-only` never deactivates or deletes anyone |

## Rules & failure behaviour
- A created employee triggers `org_snapshot`, so the org chart reflects them without waiting for the next day.
- No retry beyond the next 15-minute slot (the same as before).
