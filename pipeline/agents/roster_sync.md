# roster_sync: employee roster sync

**Job:** Reconcile the SmartOffice employee master with the console: update real names, deactivate anyone no longer Working, create employees who are Working but have no punch history, auto-resolve matching onboarding submissions.
**Code:** `../../employee_roster_sync.py`; job `roster_sync`
**Schedule (UTC):** 06:30 (window 4h, 4 attempts, 20 min apart)
**Console API:** `/api/*` employee reconcile endpoints (login with the sync account); SmartOffice web UI export via browser automation
**Waits for (hand-off):** nothing
**Sends (hand-off):** `roster_synced` with `{updated, deactivated, created}`
**Cost:** none (code only).

## Subagents
| subagent | what it does |
|---|---|
| web-exporter | logs into the SmartOffice web UI and exports the company-wide employee master CSV (the API has no employee master) |
| reconciler | matches rows to console employees per department and applies create / update / deactivate; permanently deletes only after 2+ consecutive missing runs |
| handoff | passes the counts to `org_snapshot`, which refreshes the org chart the agents read |

## Rules & failure behaviour
- Never auto-creates an employee outside the rules above and never deletes on a single missing run.
- The SmartOffice host is often unreachable; a timeout is a failure, retried, and raised as an incident only if it persists. The roster feed is judged stale after 36h.
- The penalty jobs additionally require a fresh roster, so a stale roster holds them.
