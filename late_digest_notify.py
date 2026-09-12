"""Daily late-marking digest trigger.

Logs into jade-hr with the sync account (JADE_HR_USER / JADE_HR_PASS — the
same credentials biometric_sync.py uses) and POSTs /api/attendance/late-digest,
which computes who clocked in late today (corporate roster, 10:11 AM grace with
the stay-back extensions) and emails HR the list via Resend. Sends nothing on a
day with no late arrivals.

Runs once daily from /etc/cron.d/jade-hr-sync, after the 07:00 UTC morning
punch sync has landed the day's clock-ins. The digest is only as fresh as that
sync — arrivals after it are reported on the next day's run.

Manual usage (dry run — prints the list, sends no email):
    . /etc/jade-hr-sync.env && python3 late_digest_notify.py --dry-run
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
    # Explicit start/end markers (mirrors biometric_sync.py's "starting"/
    # "Sync complete" convention) so watchdog.sh can tell, from the log alone,
    # whether the LAST invocation actually finished — this file has no per-run
    # timestamps otherwise, which made a 2026-09-12 500 failure hard to place
    # in the log after the fact.
    print(f"late-digest run starting at {datetime.now(timezone.utc).isoformat()}", file=sys.stderr, flush=True)
    if not JADE_HR_USER or not JADE_HR_PASS:
        print("ERROR: JADE_HR_USER / JADE_HR_PASS not set (see /etc/jade-hr-sync.env)", file=sys.stderr)
        sys.exit(1)

    token = _get_token()
    url = f"{JADE_HR_URL}/api/attendance/late-digest" + ("?dry_run=true" if dry else "")
    req = urllib.request.Request(
        url, data=b"", headers={"Authorization": f"Bearer {token}"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        result = json.loads(resp.read())

    # flush=True on both: stdout is block-buffered when redirected to a file
    # while stderr is not, so without this the "finished" marker below (a
    # stderr print) lands in the log BEFORE this JSON dump despite running
    # after it in code — the watchdog's own "did the last attempt finish"
    # check reads the log's line order, so this isn't just cosmetic.
    print(json.dumps(result, indent=2), flush=True)
    print(
        f"late-digest run finished: {result['count']} late on {result['date']}, "
        f"emailed={result['emailed']}",
        file=sys.stderr,
        flush=True,
    )


if __name__ == "__main__":
    main()
