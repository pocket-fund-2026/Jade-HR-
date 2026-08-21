"""Quarter Red Card runner (late-arrival policy, w.e.f. 22 September 2026).

An employee who earns a Red Card (more than 3 late markings) in EVERY month of
a financial-year quarter earns a Quarter Red Card: a Final Warning letter plus
automatic forfeiture of 2 Paid Leave days. This script logs into jade-hr with
the sync account (JADE_HR_USER / JADE_HR_PASS — the same credentials
biometric_sync.py and late_digest_notify.py use) and POSTs
/api/late-policy/quarter-red-cards/run, which computes the quarter and applies
those consequences.

Runs from /etc/cron.d/jade-hr-sync on the 23rd of March/June/September/
December — the day after the quarter's final pay period (23rd-22nd) closes.
With no arguments the endpoint resolves the quarter from today's date, which on
each of those four dates is exactly the quarter that just ended.

The run is idempotent (hr_late_policy_actions has a UNIQUE key per employee per
quarter), so a retry — or a manual run after a cron miss — can never
double-debit anyone's leave balance.

Manual usage (dry run — lists who would be actioned, applies nothing):
    . /etc/jade-hr-sync.env && python3 quarter_red_card_notify.py --dry-run

    # or a specific quarter:
    . /etc/jade-hr-sync.env && python3 quarter_red_card_notify.py --fy 2026-27 --quarter 2
"""

import json
import os
import sys
import urllib.error
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
    dry = "--dry-run" in sys.argv
    if not JADE_HR_USER or not JADE_HR_PASS:
        print("ERROR: JADE_HR_USER / JADE_HR_PASS not set (see /etc/jade-hr-sync.env)", file=sys.stderr)
        sys.exit(1)

    params = {}
    if dry:
        params["dry_run"] = "true"
    if _arg("--fy"):
        params["financial_year"] = _arg("--fy")
    if _arg("--quarter"):
        params["quarter"] = _arg("--quarter")

    token = _get_token()
    url = f"{JADE_HR_URL}/api/late-policy/quarter-red-cards/run"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url, data=b"", headers={"Authorization": f"Bearer {token}"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            result = json.loads(resp.read())
    except urllib.error.HTTPError as err:
        # A 400 here is the endpoint's own guard against acting on a quarter
        # whose last pay period hasn't closed — report it plainly instead of a
        # bare traceback, since cron mails this straight to root.
        print(f"ERROR {err.code}: {err.read().decode(errors='replace')}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(result, indent=2))
    print(
        f"quarter-red-cards: {result['quarter_label']} — {result['qualifying_count']} qualifying, "
        f"{result['applied']} actioned, dry_run={result['dry_run']}",
        file=sys.stderr,
    )


if __name__ == "__main__":
    main()
