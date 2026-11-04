# JADE HR ops pipeline

One scheduler tick (every 5 min) instead of ~10 independent cron lines and two duplicate watchdogs.

| Problem before | Now |
|---|---|
| Digests ran at fixed times whatever the sync did, so stale data could be reported | Gated on the console's own `/api/data-readiness` (biometric feed fresh) |
| Penalties (comp-off, absence hold, Quarter Red Card) acted on assumed-complete attendance | Same gate plus a fresh roster; Quarter Red Card also needs a clean `--dry-run` preview before applying |
| Two near-identical watchdog scripts, each with its own retry logic | One engine: retry with backoff, bounded attempts; email jobs never retried after an ambiguous timeout |
| No shared record | SQLite ledger, `hr-pipeline status`, `/var/lib/jade-hr-pipeline/status.json`, one alert path |
| `absence_hold_notify` was not scheduled anywhere | Defined but disabled until the user decides |

Job logic is unchanged: every job still runs the same script with the same args on the same schedule, appending to the same log file.

## Use
    hr-pipeline status            # latest slot and outcome per job
    hr-pipeline tick --dry-run    # what would happen now; executes and records nothing
    python3 -m unittest discover -s tests

## Cutover / rollback (run as root)
    bash cutover.sh     # tests, dry run, baseline today's slots, install tick cron, disable old lines (marked #DISABLED-BY-PIPELINE#)
    bash rollback.sh    # restore old lines, remove tick cron
Backup of the original crontab: `/root/jade-hr-sync.cron.bak.20261104`.

## Harness review (awesome-harness-engineering checklist)
Deterministic runner with explicit gates; errors say what to do next (alert texts); state in files/ledger not memory; destructive actions gated + previewed; audit via ledger and logs; blast radius limited (no console imports, tests cannot send email).
