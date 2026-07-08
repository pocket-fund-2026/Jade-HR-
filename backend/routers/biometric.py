from datetime import datetime

from fastapi import APIRouter, Depends

from auth import require_admin
from database import supabase
from models import BiometricPunch

router = APIRouter(prefix="/api/biometric", tags=["biometric"])


@router.post("/ingest")
def ingest(records: list[BiometricPunch], admin: dict = Depends(require_admin)):
    rows = []
    dates = []

    for r in records:
        employee_code = r.EmployeeCode.strip()
        log_date = r.LogDate.strip()
        if not employee_code or not log_date:
            continue
        try:
            punch_dt = datetime.strptime(log_date, "%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue
        dates.append(punch_dt.date())
        rows.append({
            "employee_code": employee_code,
            "punch_time": punch_dt.isoformat(),
            "serial_number": r.SerialNumber.strip(),
            "punch_direction": r.PunchDirection.strip(),
        })

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

    return {"total": len(records), "inserted": inserted, "skipped": skipped}


@router.get("/sync-log")
def sync_log(admin: dict = Depends(require_admin)):
    resp = (
        supabase.table("hr_sync_log")
        .select("*")
        .order("run_at", desc=True)
        .limit(20)
        .execute()
    )
    return resp.data
