"""Daily unapproved-absence salary-hold scan.

Logs into jade-hr with the sync account (JADE_HR_USER / JADE_HR_PASS — the
same credentials biometric_sync.py and late_digest_notify.py use) and POSTs
/api/attendance/absence-hold-scan, which finds anyone currently on a run of
MORE than 5 consecutive unapproved absent days (approved leave and WFH break
the run; weekly-offs and closed holidays read through it), puts their salary
on hold, and emails Rushikesh (Accounts) + the HR team.

Idempotent: someone already on hold is skipped, so a retry or a second run
in the same day never re-alerts. The hold is never lifted here — HR/Accounts
clears it from the employee record once the absence is explained.

Runs once daily from /etc/cron.d/jade-hr-sync.

Manual usage (dry run — lists who WOULD be held, holds nobody, emails nobody):
    . /etc/jade-hr-sync.env && python3 absence_hold_notify.py --dry-run
"""

import json
import os
import sys
import urllib.request

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
    if not JADE_HR_USER or not JADE_HR_PASS:
        print("ERROR: JADE_HR_USER / JADE_HR_PASS not set (see /etc/jade-hr-sync.env)", file=sys.stderr)
        sys.exit(1)

    token = _get_token()
    url = f"{JADE_HR_URL}/api/attendance/absence-hold-scan" + ("?dry_run=true" if dry else "")
    req = urllib.request.Request(
        url, data=b"", headers={"Authorization": f"Bearer {token}"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        result = json.loads(resp.read())

    print(json.dumps(result, indent=2))
    if not dry:
        print(
            f"absence-hold-scan: {len(result['newly_held'])} newly held on {result['date']}, "
            f"{len(result['already_on_hold'])} already on hold, emailed={result['emailed']}",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
