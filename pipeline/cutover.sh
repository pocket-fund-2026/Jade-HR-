#!/bin/bash
# One-shot cutover: old per-job cron lines + duplicate watchdogs -> single `hr-pipeline tick` every 5 minutes.
# Run as root:  bash /root/jade-hr/pipeline/cutover.sh      Undo:  bash /root/jade-hr/pipeline/rollback.sh
# Safe by construction: it baselines today's already-handled slots first, so nothing that the old cron already ran/sent today runs again.
set -euo pipefail
cd /root/jade-hr/pipeline
python3 -m unittest discover -s tests >/dev/null && echo "tests ok"
cp -n /etc/cron.d/jade-hr-sync /root/jade-hr-sync.cron.bak.pre-pipeline
./hr-pipeline tick --dry-run >/dev/null && echo "dry run ok"
./hr-pipeline baseline
cat > /etc/cron.d/jade-hr-pipeline <<'CRON'
# JADE HR ops pipeline: ONE scheduler tick replaces the individual jobs and the duplicate watchdogs formerly in /etc/cron.d/jade-hr-sync.
# Details: /root/jade-hr/pipeline/README.md   Status: hr-pipeline status
SHELL=/bin/bash
*/5 * * * * root /root/jade-hr/pipeline/hr-pipeline tick >/dev/null 2>&1
CRON
chmod 644 /etc/cron.d/jade-hr-pipeline
python3 - <<'PY'
p = '/etc/cron.d/jade-hr-sync'; out = []
for l in open(p):
    s = l.strip()
    owned = ('biometric_sync.py', 'employee_roster_sync.py', 'late_digest_notify.py', 'comp_off_accrual.py', 'clocks_digest_notify.py',
             'quarter_red_card_notify.py', 'leave_reminder_notify.py', 'watchdog.sh', 'late_digest_watchdog.sh')
    out.append('#DISABLED-BY-PIPELINE# ' + l if s and not s.startswith('#') and any(o in s for o in owned) else l)
open(p, 'w').write(''.join(out))
PY
echo "cutover done:"; ./hr-pipeline status
