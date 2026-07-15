#!/bin/bash
# JADE HR biometric-sync watchdog — runs every 5 min via cron.
#
# The Madhu Estate SmartOffice device is unreachable from this VPS for
# stretches most nights (see /var/log/jade-hr-biometric-sync.log — the
# 23:00 UTC cron run fails with "timed out" / "No route to host" far more
# often than not, while the 07:00 UTC run consistently succeeds). The sync
# script itself has no retry logic, so a failed run just sits until the
# next fixed cron slot, up to 16h later. Rather than wait, retry every 5
# min as soon as the last attempt is seen to have failed — safe to repeat,
# since biometric_sync.py's 3-day lookback + insert/skip-on-duplicate
# ingest logic makes re-running it a no-op once it actually succeeds.
set +e

LOG=/var/log/jade-hr-watchdog.log
SYNC_LOG=/var/log/jade-hr-biometric-sync.log
LOCK=/tmp/jade-hr-biometric-sync.lock

stamp() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# Log rotation — keep both logs under 2 MB, same convention as jade-tts/jade-intelligence's watchdogs.
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 2097152 ]; then
    tail -500 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi
if [ -f "$SYNC_LOG" ] && [ "$(stat -c%s "$SYNC_LOG" 2>/dev/null || echo 0)" -gt 2097152 ]; then
    tail -1000 "$SYNC_LOG" > "${SYNC_LOG}.tmp" && mv "${SYNC_LOG}.tmp" "$SYNC_LOG"
    stamp "Rotated $SYNC_LOG (was >2 MB)"
fi

if [ ! -f "$SYNC_LOG" ]; then
    stamp "No sync log yet — nothing to check"
    exit 0
fi

# Was the most recently started attempt followed by a success line before
# the next attempt (or end of file)? Mirrors reading the log the way a
# human would to answer "did the last run actually finish OK".
LAST_ATTEMPT_OK=$(awk '
    /JADE HR biometric sync starting/ { ok = 0 }
    /Sync complete/ || /Nothing to push\./ { ok = 1 }
    END { print ok + 0 }
' "$SYNC_LOG")

if [ "$LAST_ATTEMPT_OK" = "1" ]; then
    stamp "OK — last attempt succeeded"
    exit 0
fi

# Avoid stacking retries if one is still in flight (script normally takes
# well under a minute; 10 min is a generous stale-lock cutoff).
if [ -f "$LOCK" ] && [ -n "$(find "$LOCK" -mmin -10 2>/dev/null)" ]; then
    stamp "Retry already in progress — skipping this tick"
    exit 0
fi
touch "$LOCK"

stamp "Last attempt failed — retrying now"
. /etc/jade-hr-sync.env
python3 /root/jade-hr/biometric_sync.py >> "$SYNC_LOG" 2>&1
if tail -20 "$SYNC_LOG" | grep -q "Sync complete\|Nothing to push\."; then
    stamp "Retry succeeded"
else
    stamp "Retry failed again — will retry again in 5 min"
fi
rm -f "$LOCK"
