"""Daily pending-leave reminder trigger.

Logs into jade-hr with the sync account (JADE_HR_USER / JADE_HR_PASS — the
same credentials late_digest_notify.py and clocks_digest_notify.py use) and
POSTs /api/leave-reminders/digest, which emails each approver their own
team's pending leave requests (oldest first, past-date and long-waiting ones
flagged) and HR one company-wide summary. On Mondays the HR email also counts
active employees with no reporting manager. Sends nothing when nothing is
pending.

Runs once daily, Monday to Saturday, from /etc/cron.d/jade-hr-sync.

Manual usage (dry run — prints everything, sends no email):
    . /etc/jade-hr-sync.env && python3 leave_reminder_notify.py --dry-run [--weekly]
"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

JADE_HR_URL = os.environ.get("JADE_HR_URL", "https://jade-hr.vercel.app")
JADE_HR_USER = os.environ.get("JADE_HR_USER", "")  # set via /etc/jade-hr-sync.env, not hardcoded
JADE_HR_PASS = os.environ.get("JADE_HR_PASS", "")


def _get_token() -> str:
    payload = json.dumps({"employee_code": JADE_HR_USER, "password": JADE_HR_PASS}).encode()
    req = urllib.request.Request(
        f"{JADE_HR_URL}/api/auth/login",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())["access_token"]


def main() -> None:
    dry = "--dry-run" in sys.argv
    print(f"leave-reminder run starting at {datetime.now(timezone.utc).isoformat()}", file=sys.stderr, flush=True)
    if not JADE_HR_USER or not JADE_HR_PASS:
        print("ERROR: JADE_HR_USER / JADE_HR_PASS not set (see /etc/jade-hr-sync.env)", file=sys.stderr)
        sys.exit(1)

    token = _get_token()
    params = [p for p in ("dry_run=true" if dry else "", "weekly=true" if "--weekly" in sys.argv else "") if p]
    url = f"{JADE_HR_URL}/api/leave-reminders/digest" + (f"?{'&'.join(params)}" if params else "")
    req = urllib.request.Request(url, data=b"", headers={"Authorization": f"Bearer {token}"}, method="POST")
    with urllib.request.urlopen(req, timeout=90) as resp:
        result = json.loads(resp.read())

    print(json.dumps(result, indent=2), flush=True)
    sent = sum(1 for r in result["manager_reminders"] if r["emailed"])
    print(
        f"leave-reminder run finished: {result['pending']} pending, {sent}/{len(result['manager_reminders'])} "
        f"manager reminders sent, hr_emailed={result['hr_emailed']}",
        file=sys.stderr,
        flush=True,
    )


if __name__ == "__main__":
    main()
