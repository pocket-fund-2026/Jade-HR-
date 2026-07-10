import secrets
from datetime import datetime

from fastapi import APIRouter, Depends

from auth import hash_password, require_console, require_permission
from config import IST, SERIAL_TO_LOCATION
from database import supabase
from models import BiometricPunch

router = APIRouter(prefix="/api/biometric", tags=["biometric"])


def _auto_provision_employees(rows: list[dict]) -> int:
    """A punch from an employee_code jade-hr has never seen shouldn't just be
    silently dropped from payroll — create a bare-minimum, active record so
    the attendance counts from day one. employee_roster_sync.py's nightly
    run fills in the real name/DOJ the next time it sees this code in
    SmartOffice's employee master (it PUTs onto any existing employee_code,
    auto-provisioned or not)."""
    location_by_code = {}
    for row in rows:
        location_by_code.setdefault(row["employee_code"], row["device_location"])
    if not location_by_code:
        return 0

    existing = (
        supabase.table("hr_employees")
        .select("employee_code")
        .in_("employee_code", list(location_by_code.keys()))
        .execute()
        .data
    )
    missing = set(location_by_code) - {e["employee_code"] for e in existing}
    if not missing:
        return 0

    new_rows = [
        {
            "employee_code": code,
            "first_name": code,
            "last_name": "(auto-added from biometric)",
            "location": location_by_code[code],
            "role": "employee",
            "password_hash": hash_password(secrets.token_urlsafe(24)),
            "is_active": True,
        }
        for code in missing
    ]
    # ignore_duplicates guards a race with a concurrent ingest call for the same code.
    supabase.table("hr_employees").upsert(new_rows, on_conflict="employee_code", ignore_duplicates=True).execute()
    return len(new_rows)


@router.post("/ingest")
def ingest(records: list[BiometricPunch], admin: dict = Depends(require_console)):
    rows = []
    dates = []

    for r in records:
        employee_code = r.EmployeeCode.strip()
        log_date = r.LogDate.strip()
        if not employee_code or not log_date:
            continue
        try:
            # SmartOffice's LogDate is IST wall-clock time with no offset —
            # tag it explicitly so it converts to the correct UTC instant.
            punch_dt = datetime.strptime(log_date, "%Y-%m-%d %H:%M:%S").replace(tzinfo=IST)
        except ValueError:
            continue
        dates.append(punch_dt.date())
        serial = r.SerialNumber.strip()
        rows.append({
            "employee_code": employee_code,
            "punch_time": punch_dt.isoformat(),
            "serial_number": serial,
            "punch_direction": r.PunchDirection.strip(),
            "device_location": SERIAL_TO_LOCATION.get(serial, "Unknown"),
        })

    auto_provisioned = _auto_provision_employees(rows)

    inserted = 0
    if rows:
        # ON CONFLICT (employee_code, punch_time) DO NOTHING — only newly
        # inserted rows come back, so len(data) is the true insert count.
        resp = (
            supabase.table("hr_biometric_punches")
            .upsert(rows, on_conflict="employee_code,punch_time", ignore_duplicates=True)
            .execute()
        )
        inserted = len(resp.data)
    skipped = len(records) - inserted

    supabase.table("hr_sync_log").insert({
        "from_date": min(dates).isoformat() if dates else None,
        "to_date": max(dates).isoformat() if dates else None,
        "fetched": len(records),
        "inserted": inserted,
        "skipped": skipped,
        "status": "ok",
    }).execute()

    return {"total": len(records), "inserted": inserted, "skipped": skipped, "auto_provisioned": auto_provisioned}


@router.get("/sync-log")
def sync_log(admin: dict = Depends(require_permission("biometric.view"))):
    resp = (
        supabase.table("hr_sync_log")
        .select("*")
        .order("run_at", desc=True)
        .limit(20)
        .execute()
    )
    return resp.data
