from fastapi import APIRouter, Depends, HTTPException

from auth import require_console, require_permission
from database import supabase
from models import HolidayCreate

router = APIRouter(prefix="/api/holidays", tags=["holidays"])


@router.get("")
def list_holidays(user: dict = Depends(require_console)):
    resp = supabase.table("hr_holidays").select("*").order("holiday_date").execute()
    return resp.data


@router.post("")
def create_holiday(body: HolidayCreate, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    row = body.model_dump()
    row["holiday_date"] = row["holiday_date"].isoformat()
    existing = supabase.table("hr_holidays").select("id").eq("holiday_date", row["holiday_date"]).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail="A holiday is already recorded for that date")
    inserted = supabase.table("hr_holidays").insert(row).execute()
    return inserted.data[0]


@router.delete("/{holiday_id}")
def delete_holiday(holiday_id: str, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    supabase.table("hr_holidays").delete().eq("id", holiday_id).execute()
    return {"ok": True}
