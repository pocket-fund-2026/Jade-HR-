#!/bin/bash
# JADE HR late-digest watchdog — runs every 5 min via cron.
#
# The 08:00 UTC late-digest cron (late_digest_notify.py) has no retry of its
# own, and on 2026-09-12 it 500'd (Vercel's 60s maxDuration on api/index.py
# being exceeded by the full-roster attendance computation, most likely) and
# nobody — not HR, not any reporting manager — got that day's digest until it
# was caught and re-run by hand. This mirrors watchdog.sh's retry pattern for
# biometric_sync.py.
#
# Safe to retry ONLY while the last attempt actually failed: unlike the
# biometric sync (idempotent — re-ingesting is a no-op), a late-digest run
# that succeeds actually SENDS EMAIL, so this must stop retrying the moment
# one attempt finishes cleanly, not just when the underlying data looks
# stable. late_digest_notify.py prints "late-digest run starting ..." /
# "late-digest run finished ..." bracketing every attempt (dry or real) —
# used the same way watchdog.sh reads biometric_sync.py's own markers.
set +e

LOG=/var/log/jade-hr-late-digest.log
LOCK=/tmp/jade-hr-late-digest.lock

stamp() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 2097152 ]; then
    tail -1000 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
    stamp "Rotated $LOG (was >2 MB)"
fi

if [ ! -f "$LOG" ]; then
    exit 0
fi

# Only look at today's slot: don't fire a "retry" the moment midnight UTC
# ticks over with no run logged yet (the real cron isn't due till 08:00 UTC).
TODAY_UTC=$(date -u '+%Y-%m-%d')
CRON_HOUR_UTC=8
NOW_HOUR_UTC=$(date -u '+%H')
if [ "$((10#$NOW_HOUR_UTC))" -lt "$CRON_HOUR_UTC" ]; then
    exit 0
fi

LAST_ATTEMPT_OK=$(awk '
    /late-digest run starting/ { ok = 0 }
    /late-digest run finished/ { ok = 1 }
    END { print ok + 0 }
' "$LOG")

if [ "$LAST_ATTEMPT_OK" = "1" ]; then
    exit 0
fi

if [ -f "$LOCK" ] && [ -n "$(find "$LOCK" -mmin -10 2>/dev/null)" ]; then
    stamp "Retry already in progress — skipping this tick"
    exit 0
fi
touch "$LOCK"

stamp "Last late-digest attempt ($TODAY_UTC) failed — retrying now"
. /etc/jade-hr-sync.env
python3 /root/jade-hr/late_digest_notify.py >> "$LOG" 2>&1
# Whole-log start/finish scan, same as the OK check above — NOT `tail -N`:
# the JSON body between the markers can run well past N lines, which would
# otherwise put "run finished" outside the tail window and misreport a
# successful (already-emailed) run as a failure, triggering a duplicate send
# on the next tick.
RETRY_OK=$(awk '
    /late-digest run starting/ { ok = 0 }
    /late-digest run finished/ { ok = 1 }
    END { print ok + 0 }
' "$LOG")
if [ "$RETRY_OK" = "1" ]; then
    stamp "Retry succeeded"
else
    stamp "Retry failed again — will retry again in 5 min"
fi
rm -f "$LOCK"
