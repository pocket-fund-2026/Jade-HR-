# AGENTS.md: JADE HR ops pipeline

> Instructions for AI agents working in `pipeline/`. Follows the structure of ai-boost/awesome-harness-engineering templates/AGENTS.md.

## What this is
A deterministic scheduler (no model in the loop) that runs the VPS-side HR jobs in order behind a data-readiness gate, retries with backoff, records every attempt in a local SQLite ledger, and alerts on trouble. It replaces the individual cron lines and the two duplicate watchdogs. It runs ONLY on the VPS and imports nothing from `backend/` or `frontend/`: it cannot break the HR console.

## Layout
- `hrpipe/config.py` the job graph (slots, windows, gates, retry budget, success markers). The only file you normally edit.
- `hrpipe/engine.py` decision logic per job: done / gated / backoff / exhausted / run. `hrpipe/gates.py` readiness gate. `hrpipe/runner.py` subprocess + verification. `hrpipe/ledger.py` memory. `hrpipe/alerts.py` email + log.
- `hr-pipeline tick [--dry-run] | status | baseline`, `cutover.sh`, `rollback.sh`, `tests/`.

## Rules (hard)
- NEVER change what a job does (rules, recipients, thresholds). This layer only decides WHEN and WHETHER a job runs. Rule changes belong in `backend/` with their own review.
- Jobs that send email or apply a penalty are `idempotent=False`: retried only after a provably failed attempt, never after a timeout (they may have acted).
- Penalty jobs (`quarter_red_card`, `absence_hold`) require the gate AND a clean `--dry-run` preview first.
- `absence_hold` is disabled by default: it was unscheduled before this pipeline and puts salaries on hold. Enabling needs the user's explicit go-ahead.
- Never print or log credentials. Never run tests that can send email: `tests/` stubs `alerts.send` and `alerts.log`; keep it that way.
- Do not edit `/etc/cron.d/*` yourself; give the user `cutover.sh` / `rollback.sh` to run.

## Verification gates (run before saying done)
1. `cd /root/jade-hr/pipeline && python3 -m unittest discover -s tests` must pass.
2. `./hr-pipeline tick --dry-run` must plan only what you expect and change nothing.
3. After any `config.py` change, re-run both, then `./hr-pipeline status`.

## Tool permissions
Allowed: read logs and the ledger, run tests and `--dry-run`, edit `pipeline/`. Ask first: real `tick`, cron changes, enabling `absence_hold`, anything touching `backend/` or `frontend/`.
