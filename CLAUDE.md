## Harness: HR ops pipeline

**Goal:** Run the VPS-side HR jobs (attendance/roster sync, digests, comp-off, Quarter Red Card) in order, behind the data-readiness gate, with retries, a ledger and alerts. Code in `pipeline/`.

**Invocation:** For any question about why an HR cron job did/didn't run, or to add/retime a job, use the `hr-pipeline-ops` skill / `hr-pipeline-operator` agent and read `pipeline/AGENTS.md`. Never edit /etc/cron.d by hand: use `pipeline/cutover.sh` / `rollback.sh`.

**Change history:**
| Date | Change | Target | Reason |
| --- | --- | --- | --- |
| 2026-11-04 | Built pipeline (engine, gates, ledger, alerts, tests, cutover/rollback). Not yet cut over: old cron still live. | pipeline/ | Duplicate watchdogs; penalties and digests ran without checking data freshness |
