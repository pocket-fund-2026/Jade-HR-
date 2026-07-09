"""
JADE HR employee roster sync — all Jade retail/office locations.

Logs into the SmartOffice web UI (the API has no employee-master endpoint,
only punch logs), exports the company-wide employee master CSV, filters to
each known department (see DEPARTMENTS below), and reconciles against jade-hr:
  - updates real names on existing employees
  - deactivates anyone whose SmartOffice status isn't "Working" (resigned etc.)
  - creates employees who are Working but have no punch history yet

Requires Playwright + a Chromium binary (uses the system google-chrome).
Run as a cron job on this VPS (/etc/cron.d/jade-hr-sync). Salary fields
(Basic/HRA/Conveyance) aren't in SmartOffice at all — this never touches
them, they stay whatever an admin has set via the UI.

Manual usage:
  python employee_roster_sync.py
"""

import csv
import io
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from playwright.sync_api import sync_playwright

# ── CONFIG ────────────────────────────────────────────────────────────────

SMARTOFFICE_BASE = os.environ.get("SMARTOFFICE_BASE", "http://122.179.138.219:92")
SMARTOFFICE_WEB_USER = os.environ.get("SMARTOFFICE_WEB_USER", "")  # set via /etc/jade-hr-sync.env
SMARTOFFICE_WEB_PASS = os.environ.get("SMARTOFFICE_WEB_PASS", "")
# Client-side AES key/IV the SmartOffice login page uses to encrypt the
# password before POSTing (see Default.aspx's onSubmit() function).
_AES_KEY = b"absf1245mm12wsdf"
_AES_IV = b"absf1245mm12wsdf"

# SmartOffice department name -> (jade-hr location, password prefix).
# Keep in sync with backend/config.py's SERIAL_TO_LOCATION.
DEPARTMENTS = {
    "Mumbai-Madhu Estate Staff": ("Madhu Estate, Mumbai", "Madhu"),
    "Mumbai Pedder Road": ("Pedder Road, Mumbai", "Jade"),
    "Delhi Mehrauli Store": ("Mehrauli (Ambawatta), Delhi", "Jade"),
    "Delhi Emporio Store": ("Emporio, Delhi", "Jade"),
    "Ahmedabad Retail Store": ("Ahmedabad", "Jade"),
    "Kolkatta": ("Kolkata", "Jade"),
}

JADE_HR_URL = os.environ.get("JADE_HR_URL", "https://jade-hr.vercel.app")
JADE_HR_USER = os.environ.get("JADE_HR_USER", "")  # set via /etc/jade-hr-sync.env, not hardcoded
JADE_HR_PASS = os.environ.get("JADE_HR_PASS", "")

CHROME_PATH = os.environ.get("CHROME_PATH", "/usr/bin/google-chrome")


def _encrypt_password(plaintext: str) -> str:
    import base64

    padder = padding.PKCS7(128).padder()
    padded = padder.update(plaintext.encode("utf-8")) + padder.finalize()
    encryptor = Cipher(algorithms.AES(_AES_KEY), modes.CBC(_AES_IV)).encryptor()
    ct = encryptor.update(padded) + encryptor.finalize()
    return base64.b64encode(ct).decode("ascii")


def export_employee_master_csv() -> str:
    """Logs into SmartOffice and returns the raw CSV text of the employee export."""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=CHROME_PATH)
        context = browser.new_context(accept_downloads=True)
        page = context.new_page()
        page.goto(f"{SMARTOFFICE_BASE}/Default.aspx", timeout=30000)
        page.fill("#txt_Login", SMARTOFFICE_WEB_USER)
        page.fill("#txt_Password", SMARTOFFICE_WEB_PASS)
        page.click("#btn_Login")
        page.wait_for_load_state("networkidle", timeout=30000)

        if "Default.aspx" in page.url:
            browser.close()
            raise RuntimeError("SmartOffice web login failed — check SMARTOFFICE_WEB_USER/PASS")

        with page.expect_download(timeout=30000) as download_info:
            try:
                page.goto(
                    f"{SMARTOFFICE_BASE}/ExportEmployeeDetails.aspx?ActionName=ExportEmployeeDetails",
                    timeout=30000,
                )
            except Exception:
                pass  # goto always raises for direct downloads — expected
        download = download_info.value
        path = download.path()
        with open(path, "r", encoding="utf-8-sig") as f:
            csv_text = f.read()
        browser.close()
        return csv_text


def _get_jade_hr_token() -> str:
    payload = json.dumps({"employee_code": JADE_HR_USER, "password": JADE_HR_PASS}).encode()
    req = urllib.request.Request(
        f"{JADE_HR_URL}/api/auth/login", data=payload, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())["access_token"]


def _api(token: str, method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        f"{JADE_HR_URL}{path}", data=data, method=method,
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.status, json.loads(resp.read())


def reconcile(csv_text: str, token: str):
    rows = list(csv.DictReader(io.StringIO(csv_text)))
    # employee_code -> (master row, location, password_prefix), across all known departments
    tracked = {}
    for r in rows:
        dept = DEPARTMENTS.get(r["Department"])
        if dept:
            tracked[r["EmployeeCode"].strip()] = (r, dept[0], dept[1])

    _, existing = _api(token, "GET", "/api/employees")
    existing_by_code = {e["employee_code"]: e for e in existing}

    updated = deactivated = created = unmatched = 0

    for code, emp in existing_by_code.items():
        if code == JADE_HR_USER:
            continue
        entry = tracked.get(code)
        if not entry:
            unmatched += 1
            continue
        master, location, _ = entry
        parts = master["EmployeeName"].strip().split(" ", 1)
        first, last = parts[0], (parts[1] if len(parts) > 1 else "")
        is_working = master["Status"] == "Working"
        body = {"first_name": first, "last_name": last, "is_active": is_working, "location": location}
        doj = master.get("DOJ", "")
        if doj and doj not in ("1900-01-01", "3000-01-01", ""):
            body["date_of_joining"] = doj
        status, _ = _api(token, "PUT", f"/api/employees/{emp['id']}", body)
        if status == 200:
            updated += 1
            if not is_working:
                deactivated += 1

    existing_codes = set(existing_by_code.keys())
    for code, (master, location, pw_prefix) in tracked.items():
        if master["Status"] != "Working" or code in existing_codes:
            continue
        parts = master["EmployeeName"].strip().split(" ", 1)
        first, last = parts[0], (parts[1] if len(parts) > 1 else "")
        body = {
            "employee_code": code, "first_name": first, "last_name": last,
            "location": location, "role": "employee",
            "password": f"{pw_prefix}@{code}!2026",
        }
        doj = master.get("DOJ", "")
        if doj and doj not in ("1900-01-01", "3000-01-01", ""):
            body["date_of_joining"] = doj
        status, _ = _api(token, "POST", "/api/employees", body)
        if status == 200:
            created += 1

    return {"updated": updated, "deactivated": deactivated, "created": created, "unmatched": unmatched}


def main():
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] JADE HR roster sync starting")
    missing = [
        n for n, v in [
            ("SMARTOFFICE_WEB_USER", SMARTOFFICE_WEB_USER), ("SMARTOFFICE_WEB_PASS", SMARTOFFICE_WEB_PASS),
            ("JADE_HR_USER", JADE_HR_USER), ("JADE_HR_PASS", JADE_HR_PASS),
        ] if not v
    ]
    if missing:
        print(f"ERROR: missing env vars (see /etc/jade-hr-sync.env): {', '.join(missing)}", file=sys.stderr)
        sys.exit(1)
    try:
        csv_text = export_employee_master_csv()
    except Exception as e:
        print(f"ERROR exporting from SmartOffice: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        token = _get_jade_hr_token()
    except Exception as e:
        print(f"ERROR logging into jade-hr: {e}", file=sys.stderr)
        sys.exit(1)

    try:
        result = reconcile(csv_text, token)
    except urllib.error.HTTPError as e:
        print(f"ERROR reconciling: {e.code} {e.read().decode()[:300]}", file=sys.stderr)
        sys.exit(1)

    print(f"  Updated: {result['updated']} (of which deactivated: {result['deactivated']})")
    print(f"  Created: {result['created']}")
    print(f"  Unmatched (not found in any tracked department's master): {result['unmatched']}")
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] Roster sync complete")


if __name__ == "__main__":
    main()
