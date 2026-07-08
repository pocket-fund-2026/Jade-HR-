"""
JADE HR biometric sync — Madhu Estate, Mumbai.

Pulls punch logs from the SmartOffice biometric API and pushes them into
jade-hr via /api/biometric/ingest. Mirrors the pattern used by jade-tts's
biometric_relay.py — run this as a cron job wherever it has network access
to the SmartOffice device (either directly on this VPS if the device is
reachable, or on a machine at Madhu Estate otherwise, same as jade-tts's
Kolkata relay).

*** REQUIRES CONFIG BEFORE FIRST RUN ***
  SMARTOFFICE_URL  — base URL of the Madhu Estate SmartOffice device/server,
                      e.g. "http://<device-ip>:<port>/api/v2/WebAPI/GetDeviceLogs"
                      (unknown — get this from whoever manages the Madhu
                      Estate biometric device, same as the Kolkata one at
                      45.118.183.175:86)
  DEVICE_SERIALS   — optional set of device serial numbers to filter to, if
                      this SmartOffice server also serves other locations.
                      Leave empty to accept all records the server returns.
  JADE_HR_URL      — the deployed jade-hr API base (filled in once the
                      Vercel project exists)
  JADE_HR_USER / JADE_HR_PASS — a dedicated admin service account created
                      in jade-hr for this sync job (do not reuse a human's
                      login)

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

SMARTOFFICE_URL = os.environ.get("SMARTOFFICE_URL", "")  # TODO: Madhu Estate device host
SMARTOFFICE_API_KEY = os.environ.get("SMARTOFFICE_API_KEY", "050418072608")
DEVICE_SERIALS = set(filter(None, os.environ.get("DEVICE_SERIALS", "").split(",")))

JADE_HR_URL = os.environ.get("JADE_HR_URL", "https://jade-hr.vercel.app")
JADE_HR_USER = os.environ.get("JADE_HR_USER", "")  # TODO: dedicated sync service account
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

def _fetch_punches(from_dt: str, to_dt: str) -> list:
    if not SMARTOFFICE_URL:
        raise RuntimeError(
            "SMARTOFFICE_URL is not set — get the Madhu Estate device/server "
            "address and set it via env var (or edit this file) before running."
        )
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
