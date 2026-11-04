# org_snapshot: org chart for the agents

**Job:** Write a trimmed, derived copy of the live org chart (who reports to whom, department teams, confident department heads) that the careers agents read.
**Code:** `../org_snapshot.py`; job `org_snapshot`
**Schedule (UTC):** 06:40 as a fallback, **and** once per `roster_synced` / `employees_added` hand-off (any time of day)
**Console API:** `GET /api/org-chart` (read-only)
**Waits for (hand-off):** `roster_synced`, `employees_added` (triggers; no clock dependency on SmartOffice)
**Sends (hand-off):** `org_updated` with `{people, departments}`
**Cost:** none (code only).

## Subagents
| subagent | what it does |
|---|---|
| fetcher | reads the console's own org chart |
| deriver | computes reports, chain to the top and department heads; marks a head low-confidence unless they have a leadership title or reports |
| publisher | writes `/var/lib/jade-hr-pipeline/org.json` atomically, mode 0640; refuses to replace a good file with a response under 5 people |

## Rules & failure behaviour
- Contains no salary, date of birth, contact or exit data.
- Consumers: careers agents via `agents/core/org.js` (interviewer role and reporting line, team line in briefs); they log `org chart refreshed` when the file changes.
