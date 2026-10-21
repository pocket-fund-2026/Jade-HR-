"""Daily onboarding escalation trigger.

Logs into jade-hr with the sync account (JADE_HR_USER / JADE_HR_PASS, same
as late_digest_notify.py) and POSTs /api/onboarding-cases/escalate, which
emails the escalation contact (Gaurav, set on the Onboarding Pipeline
settings) every new joiner with a stuck or missed step: unsigned NDA, Dev's
countersignature pending, form not filled, no work email after joining,
biometric not confirmed, Slack not invited, analyst document not sent, no
reporting manager, failed emails. Sends nothing when nothing is stuck.

Runs from /etc/cron.d/jade-hr-sync. Dry run:
    . /etc/jade-hr-sync.env && python3 onboarding_escalation_notify.py --dry-run
"""

import json
import os
import sys
import urllib.request

JADE_HR_URL = os.environ.get("JADE_HR_URL", "https://jade-hr.vercel.app")
JADE_HR_USER = os.environ.get("JADE_HR_USER", "")
JADE_HR_PASS = os.environ.get("JADE_HR_PASS", "")


def _get_token() -> str:
    payload = json.dumps({"employee_code": JADE_HR_USER, "password": JADE_HR_PASS}).encode()
    req = urllib.request.Request(
        f"{JADE_HR_URL}/api/auth/login", data=payload, headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())["access_token"]


def main() -> None:
    dry = "--dry-run" in sys.argv
    if not JADE_HR_USER or not JADE_HR_PASS:
        print("ERROR: JADE_HR_USER / JADE_HR_PASS not set (see /etc/jade-hr-sync.env)", file=sys.stderr)
        sys.exit(1)
    token = _get_token()
    url = f"{JADE_HR_URL}/api/onboarding-cases/escalate" + ("?dry_run=true" if dry else "")
    req = urllib.request.Request(url, data=b"", headers={"Authorization": f"Bearer {token}"}, method="POST")
    with urllib.request.urlopen(req, timeout=90) as resp:
        result = json.loads(resp.read())
    print(json.dumps(result, indent=2))
    print(f"onboarding-escalation: {len(result['flagged'])} flagged, emailed={result['emailed']} to={result.get('to')}", file=sys.stderr)


if __name__ == "__main__":
    main()
