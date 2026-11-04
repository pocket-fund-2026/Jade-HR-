---
name: hr-pipeline-ops
description: How to run, inspect and extend the JADE HR ops pipeline (attendance sync, roster sync, digests, comp-off, quarter red card). Use when asked why an HR cron job did or did not run, to add or retime a job, to check data freshness gates, or to cut over / roll back cron. Also for "rerun", "held", "stale feed", "penalty gate".
---
# HR pipeline ops

1. **Look first:** `/root/jade-hr/pipeline/hr-pipeline status`; then `tail /var/log/jade-hr-pipeline.log`; each job also appends to its original log (`/var/log/jade-hr-*.log`).
2. **Hand-offs:** `hr-pipeline handoffs` shows who sent what and who consumed it; a job with `after` waits for its upstream hand-off. Specs per job: `pipeline/agents/`.
3. **Why held:** the job's `gate` in `hrpipe/config.py` reads `/api/data-readiness`. Biometric feed must be fresh (the console's own 6h rule); penalty jobs also need a fresh roster. It runs by itself once the feed recovers; holds do not use up retries.
4. **Adding a job:** add an entry to `JOBS` (slots in UTC, window, gate, idempotent flag, success_re). If it emails or applies a penalty set `idempotent=False`. Add a test, run the suite and `tick --dry-run`.
5. **Never** change job rules here, edit cron by hand, or make tests send email. Cutover/rollback: `pipeline/cutover.sh` / `rollback.sh`, run by the user.
