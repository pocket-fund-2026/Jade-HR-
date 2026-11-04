# HR pipeline agents

Ten single-purpose agents run the VPS-side HR automation. Each has a spec here (`<job>.md`), and its code is the script named in the spec; the shared engine is `../hrpipe/`. They are **code-only: no model, no tokens.** They do not call each other: when one finishes it sends a typed **hand-off** carrying what it found, and the jobs that depend on it react.

```
 attendance_sync ──attendance_synced {inserted,skipped,total}──┬─> late_digest        (waits for it; runs right after it lands)
   (SmartOffice punches -> console)                            ├─> comp_off_accrual
                                                               ├─> absence_hold  (disabled by default)
                                                               └─> quarter_red_card  (also needs fresh roster + clean preview)
 roster_sync ───────roster_synced {updated,deactivated,created}─┐
 roster_new_joiners ─employees_added {created>0} ───────────────┴─> org_snapshot ──org_updated {people,departments}──> careers agents
 clocks_digest, leave_reminders: independent (time-driven), results recorded
```
Hand-offs are rows in the ledger (`hr-pipeline handoffs`) and lines in `/var/lib/jade-hr-pipeline/handoffs.jsonl`. The careers agents read the org snapshot and log an `org chart refreshed` entry when it changes.

## Rules for every agent here
1. **Same job, same schedule as before.** A job's rules, recipients and thresholds live in the console backend, never here. The pipeline only decides *when* and *whether* it runs, and what it passes on.
2. **A dependent never runs on stale data.** `after` = the upstream hand-off must exist within the job's window; the console's `/api/data-readiness` gate must also pass. Waiting is not failing: holds don't use up retries, and the job runs by itself once the data lands.
3. **Email / penalty jobs are retried only after a provably failed attempt**, never after an ambiguous timeout (it may already have acted).
4. **One alert email per outage**, only after something has been down 15+ minutes; further problems join the open incident silently.
5. **Results are verified, not assumed:** exit 0 plus the job's success marker, then parsed into structured facts.
6. **Never print credentials.** Tests must not send email or write real logs.

## Where things are
Job graph: `../hrpipe/config.py` (slots, window, `after`, `triggers`, `emits`, `parse`). Engine: `../hrpipe/engine.py`. Ledger: `/var/lib/jade-hr-pipeline/ledger.db`. Status: `hr-pipeline status`, `hr-pipeline handoffs`. Logs: each job keeps its original `/var/log/jade-hr-*.log`; the scheduler writes `/var/log/jade-hr-pipeline.log`.
