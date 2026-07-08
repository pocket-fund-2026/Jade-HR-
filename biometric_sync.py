"""
JADE HR biometric sync — Madhu Estate, Mumbai.

Pulls punch logs from the SmartOffice biometric API and pushes them into
jade-hr via /api/biometric/ingest. Mirrors the pattern used by jade-tts's
biometric_relay.py. Runs as a cron job on this VPS (/etc/cron.d/jade-hr-sync).

The Madhu-Estate-specific API key SmartOffice showed us never authenticated
(confirmed rejected 5 different ways). This account's SmartOffice server is
shared across all Jade locations, so we use the same key jade-tts already
uses for Kolkata and filter to Madhu Estate's device serial instead.

Manual usage:
  python biometric_sync.py                          # last 3 days (default)
  python biometric_sync.py 2026-07-01                # from date to today
  python biometric_sync.py 2026-07-01 2026-07-08      # specific range
"""

import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from datetime import date, datetime, timedelta

# ── CONFIG ────────────────────────────────────────────────────────────────

SMARTOFFICE_URL = os.environ.get(
    "SMARTOFFICE_URL", "http://122.179.138.219:92/api/v2/WebAPI/GetDeviceLogs"
)
# Shared account key (same one jade-tts uses for Kolkata) — Madhu Estate's
# own key never worked, see module docstring.
SMARTOFFICE_API_KEY = os.environ.get("SMARTOFFICE_API_KEY", "120612082520")
MADHU_ESTATE_SERIAL = "C2696422DF0E2832"
DEVICE_SERIALS = set(filter(None, os.environ.get("DEVICE_SERIALS", MADHU_ESTATE_SERIAL).split(",")))

JADE_HR_URL = os.environ.get("JADE_HR_URL", "https://jade-hr.vercel.app")
JADE_HR_USER = os.environ.get("JADE_HR_USER", "")  # set via /etc/jade-hr-sync.env, not hardcoded
JADE_HR_PASS = os.environ.get("JADE_HR_PASS", "")

LOOKBACK_DAYS = 3


# ── AUTH ──────────────────────────────────────────────────────────────────

def _get_token() -> str:
    payload = json.dumps({"employee_code": JADE_HR_USER, "password": JADE_HR_PASS}).encode()
    req = urllib.request.Request(
        f"{JADE_HR_URL}/api/auth/login",
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())["access_token"]


# ── FETCH ─────────────────────────────────────────────────────────────────

def _to_smartoffice_fmt(d: str) -> str:
    """Convert yyyy-MM-dd (or yyyy-MM-dd HH:MM:SS) to MM/dd/yyyy — what this
    SmartOffice server's GetDeviceLogs actually expects (confirmed by hand)."""
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(d, fmt).strftime("%m/%d/%Y")
        except ValueError:
            continue
    return d


def _fetch_punches(from_dt: str, to_dt: str) -> list:
    from_dt, to_dt = _to_smartoffice_fmt(from_dt), _to_smartoffice_fmt(to_dt)
    url = (
        f"{SMARTOFFICE_URL}"
        f"?APIKey={SMARTOFFICE_API_KEY}"
        f"&FromDate={urllib.parse.quote(from_dt)}"
        f"&ToDate={urllib.parse.quote(to_dt)}"
    )
    print(f"  Calling: {url}")
    with urllib.request.urlopen(url, timeout=30) as resp:
        data = json.loads(resp.read())
    if not isinstance(data, list):
        raise RuntimeError(f"Unexpected SmartOffice response: {data}")
    return data


# ── PUSH ──────────────────────────────────────────────────────────────────

def _push_punches(records: list, token: str) -> dict:
    payload = json.dumps(records).encode()
    req = urllib.request.Request(
        f"{JADE_HR_URL}/api/biometric/ingest",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.loads(resp.read())


# ── MAIN ──────────────────────────────────────────────────────────────────

def main():
    today = date.today()

    if len(sys.argv) == 3:
        from_date_str, to_date_str = sys.argv[1], sys.argv[2]
    elif len(sys.argv) == 2:
        from_date_str, to_date_str = sys.argv[1], str(today)
    else:
        from_date_str = str(today - timedelta(days=LOOKBACK_DAYS - 1))
        to_date_str = str(today)

    from_dt = f"{from_date_str} 00:00:00"
    to_dt = f"{to_date_str} 23:59:59"

    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] JADE HR biometric sync starting")
    print(f"  Date range: {from_dt} -> {to_dt}")

    if not JADE_HR_USER or not JADE_HR_PASS:
        print("ERROR: JADE_HR_USER / JADE_HR_PASS not set (see /etc/jade-hr-sync.env)", file=sys.stderr)
        sys.exit(1)

    print("Fetching SmartOffice punch logs ...")
    try:
        records = _fetch_punches(from_dt, to_dt)
    except Exception as e:
        print(f"ERROR fetching from SmartOffice: {e}", file=sys.stderr)
        sys.exit(1)

    if DEVICE_SERIALS:
        records = [r for r in records if r.get("SerialNumber", "") in DEVICE_SERIALS]

    print(f"  Got {len(records)} records")
    if not records:
        print("Nothing to push.")
        return

    for serial, count in Counter(r.get("SerialNumber", "unknown") for r in records).items():
        print(f"    Device {serial}: {count} punches")

    print("Authenticating with jade-hr ...")
    try:
        token = _get_token()
    except Exception as e:
        print(f"ERROR logging into jade-hr: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"Pushing {len(records)} records to jade-hr ...")
    try:
        result = _push_punches(records, token)
    except urllib.error.HTTPError as e:
        print(f"ERROR pushing to jade-hr: {e.code} {e.read().decode()[:300]}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR pushing to jade-hr: {e}", file=sys.stderr)
        sys.exit(1)

    print(f"  Done — inserted={result['inserted']}  skipped={result['skipped']}  total={result['total']}")
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Sync complete")


if __name__ == "__main__":
    main()
