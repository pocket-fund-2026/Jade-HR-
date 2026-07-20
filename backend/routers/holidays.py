from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user, require_console, require_permission
from database import supabase
from models import HolidayCreate
from payroll import _holiday_applies

router = APIRouter(prefix="/api/holidays", tags=["holidays"])
# Separate router (not a sub-path of /api/holidays) so this lands at
# /api/me/holidays — matching every other self-service endpoint's
# /api/me/* convention (leave.py, payroll.py, etc.) instead of /api/holidays/me.
me_router = APIRouter(prefix="/api/me", tags=["holidays"])


@router.get("")
def list_holidays(
    year: int | None = Query(default=None),
    location: str | None = Query(default=None),
    user: dict = Depends(require_console),
):
    query = supabase.table("hr_holidays").select("*")
    if year:
        query = query.gte("holiday_date", f"{year}-01-01").lte("holiday_date", f"{year}-12-31")
    resp = query.order("holiday_date").execute()
    rows = resp.data
    if location:
        # location itself is treated as an employee location here, so a
        # filter for "Mumbai" or "HQ" surfaces exactly what that store
        # would see — its own rows plus any company-wide (location=None) one.
        rows = [r for r in rows if _holiday_applies(r.get("location"), location)]
    return rows


@me_router.get("/holidays")
def my_holidays(year: int | None = Query(default=None), user: dict = Depends(get_current_user)):
    """Every employee's own holiday calendar, scoped to their own location —
    same filtering _holiday_applies already does for the admin console's
    location query param, just implicitly scoped to the caller instead of an
    arbitrary caller-supplied location. No permission gate: this is the
    caller's own data, same as every other /me/* endpoint."""
    query = supabase.table("hr_holidays").select("*")
    if year:
        query = query.gte("holiday_date", f"{year}-01-01").lte("holiday_date", f"{year}-12-31")
    resp = query.order("holiday_date").execute()
    return [r for r in resp.data if _holiday_applies(r.get("location"), user.get("location"))]


@router.post("")
def create_holiday(body: HolidayCreate, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    row = body.model_dump()
    row["holiday_date"] = row["holiday_date"].isoformat()
    if row.get("close_time"):
        row["close_time"] = row["close_time"].isoformat()
    existing = supabase.table("hr_holidays").select("id").eq("holiday_date", row["holiday_date"])
    existing = existing.is_("location", "null") if not row.get("location") else existing.eq("location", row["location"])
    if existing.execute().data:
        raise HTTPException(status_code=409, detail="A holiday is already recorded for that date and location")
    inserted = supabase.table("hr_holidays").insert(row).execute()
    return inserted.data[0]


@router.delete("/{holiday_id}")
def delete_holiday(holiday_id: str, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    supabase.table("hr_holidays").delete().eq("id", holiday_id).execute()
    return {"ok": True}
