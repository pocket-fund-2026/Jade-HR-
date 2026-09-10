"""Daily HR clocks digest trigger.

Logs into jade-hr with the sync account (JADE_HR_USER / JADE_HR_PASS — the
same credentials biometric_sync.py and late_digest_notify.py use) and POSTs
/api/clocks/digest, which emails HR (and each affected reporting manager)
every active AIP, probation completion, or notice-period exit currently in
the red/amber urgency zone shown on the Dashboard's "Upcoming Clocks" panel.
Sends nothing on a day with nothing urgent.

Runs once daily from /etc/cron.d/jade-hr-sync.

Manual usage (dry run — prints the list, sends no email):
    . /etc/jade-hr-sync.env && python3 clocks_digest_notify.py --dry-run
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
    url = f"{JADE_HR_URL}/api/clocks/digest" + ("?dry_run=true" if dry else "")
    req = urllib.request.Request(
        url, data=b"", headers={"Authorization": f"Bearer {token}"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=90) as resp:
        result = json.loads(resp.read())

    print(json.dumps(result, indent=2))
    if not dry:
        print(
            f"clocks-digest: {result['counts']} on {result['date']}, "
            f"emailed={result['emailed']}, managers_emailed={len(result['manager_digests'])}",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
