"""Comp-Off accrual runner.

Logs into jade-hr with the sync account (JADE_HR_USER / JADE_HR_PASS — the
same credentials biometric_sync.py and late_digest_notify.py use) and POSTs
/api/comp-off/accrual-scan, which credits hr_comp_off_ledger for every
comp-off the attendance engine says was earned in the pay period: working a
weekly off or declared holiday (0.5 units under 4h, else 1.0), and work
continuing past 12:30 AM (1.0).

Idempotent — the ledger has a UNIQUE (employee_id, earned_date), so a day
already credited is skipped rather than duplicated. Safe to re-run, and safe
to run daily even though it re-walks the whole period each time.

Runs daily from /etc/cron.d/jade-hr-sync, after the morning punch sync.

Manual usage:
    # dry run — lists what WOULD be credited, writes nothing
    . /etc/jade-hr-sync.env && python3 comp_off_accrual.py --dry-run

    # backfill a specific pay period
    . /etc/jade-hr-sync.env && python3 comp_off_accrual.py --year 2026 --month 9
"""

import json
import os
import sys
import urllib.parse
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


def _arg(flag: str) -> str | None:
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else None


def main() -> None:
    if not JADE_HR_USER or not JADE_HR_PASS:
        print("ERROR: JADE_HR_USER / JADE_HR_PASS not set (see /etc/jade-hr-sync.env)", file=sys.stderr)
        sys.exit(1)

    params = {}
    if "--dry-run" in sys.argv:
        params["dry_run"] = "true"
    for flag in ("--year", "--month"):
        value = _arg(flag)
        if value:
            params[flag.lstrip("-")] = value

    token = _get_token()
    url = f"{JADE_HR_URL}/api/comp-off/accrual-scan"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url, data=b"", headers={"Authorization": f"Bearer {token}"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        result = json.loads(resp.read())

    print(json.dumps(result, indent=2))
    print(
        f"comp-off accrual: {result['credited_count']} credited, "
        f"{result['already_credited_skipped']} already on file"
        + (" (DRY RUN, nothing written)" if result.get("dry_run") else ""),
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
