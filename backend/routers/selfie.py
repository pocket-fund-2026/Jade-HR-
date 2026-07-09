import base64
from datetime import datetime, time

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from config import IST
from database import supabase
from models import SelfieCheckinRequest

router = APIRouter(prefix="/api/me", tags=["selfie"])


def _today_punches(employee_code: str) -> list[dict]:
    now = datetime.now(IST)
    today_start = datetime.combine(now.date(), time.min, tzinfo=IST)
    resp = (
        supabase.table("hr_biometric_punches")
        .select("punch_time,punch_direction")
        .eq("employee_code", employee_code)
        .gte("punch_time", today_start.isoformat())
        .order("punch_time")
        .execute()
    )
    return resp.data


@router.get("/selfie-status")
def selfie_status(user: dict = Depends(get_current_user)):
    return {
        "requires_selfie_checkin": bool(user.get("requires_selfie_checkin")),
        "todays_punches": _today_punches(user["employee_code"]),
    }


@router.post("/selfie-checkin")
def selfie_checkin(body: SelfieCheckinRequest, user: dict = Depends(get_current_user)):
    if not user.get("requires_selfie_checkin"):
        raise HTTPException(status_code=403, detail="Selfie check-in isn't enabled for this account")

    now = datetime.now(IST)
    direction = "IN" if len(_today_punches(user["employee_code"])) == 0 else "OUT"

    try:
        raw = body.photo_base64.split(",", 1)[-1]
        photo_bytes = base64.b64decode(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid photo data")
    if len(photo_bytes) > 8 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo too large")

    path = f"{user['employee_code']}/{now.strftime('%Y%m%d_%H%M%S')}.jpg"
    try:
        supabase.storage.from_("selfies").upload(path, photo_bytes, {"content-type": "image/jpeg"})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Photo upload failed: {e}")

    supabase.table("hr_biometric_punches").insert({
        "employee_code": user["employee_code"],
        "punch_time": now.isoformat(),
        "serial_number": "WEB_SELFIE",
        "punch_direction": direction,
        "device_location": user.get("location") or "",
    }).execute()

    return {"direction": direction, "time": now.isoformat(), "photo_path": path}
