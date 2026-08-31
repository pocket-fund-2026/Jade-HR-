from datetime import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from auth import get_current_user, require_permission
from database import supabase
from payroll import register_time_slot, unregister_time_slot

router = APIRouter(tags=["store-timings"])


class TimeSlotCreate(BaseModel):
    label: str
    shift_start: time
    sort_order: int = 0


class StoreTimingCreate(BaseModel):
    store: str
    opening: str = ""
    trading: str = ""
    closing: str = ""
    default_time_slot: str | None = None
    sort_order: int = 0


def load_time_slots_into_payroll() -> None:
    """Registers every hr_time_slots row into payroll.SHIFT_START_BY_TIME_SLOT
    — called at backend startup so admin-defined slots grade lateness
    correctly from the first request, without waiting on an edit."""
    try:
        rows = supabase.table("hr_time_slots").select("label,shift_start").execute().data
    except Exception:
        # A DB hiccup at boot shouldn't crash startup — the 4 slots hardcoded
        # as payroll.py defaults still work; this just skips any custom ones
        # until the next successful load (next admin edit, or restart).
        return
    for row in rows:
        h, m = row["shift_start"].split(":")[:2]
        register_time_slot(row["label"], time(int(h), int(m)))


@router.get("/api/time-slots")
def list_time_slots(user: dict = Depends(get_current_user)):
    resp = supabase.table("hr_time_slots").select("*").order("sort_order").execute()
    return resp.data


@router.post("/api/time-slots")
def create_time_slot(body: TimeSlotCreate, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    row = body.model_dump()
    row["shift_start"] = row["shift_start"].isoformat()
    inserted = supabase.table("hr_time_slots").insert(row).execute()
    register_time_slot(body.label, body.shift_start)
    return inserted.data[0]


@router.put("/api/time-slots/{slot_id}")
def update_time_slot(slot_id: str, body: TimeSlotCreate, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    existing = supabase.table("hr_time_slots").select("label").eq("id", slot_id).single().execute().data
    row = body.model_dump()
    row["shift_start"] = row["shift_start"].isoformat()
    updated = supabase.table("hr_time_slots").update(row).eq("id", slot_id).execute()
    if existing and existing["label"] != body.label:
        unregister_time_slot(existing["label"])
    register_time_slot(body.label, body.shift_start)
    return updated.data[0]


@router.delete("/api/time-slots/{slot_id}")
def delete_time_slot(slot_id: str, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    existing = supabase.table("hr_time_slots").select("label").eq("id", slot_id).single().execute().data
    supabase.table("hr_time_slots").delete().eq("id", slot_id).execute()
    if existing:
        unregister_time_slot(existing["label"])
    return {"ok": True}


@router.get("/api/store-timings")
def list_store_timings(user: dict = Depends(get_current_user)):
    resp = supabase.table("hr_store_timings").select("*").order("sort_order").execute()
    return resp.data


@router.post("/api/store-timings")
def create_store_timing(body: StoreTimingCreate, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    inserted = supabase.table("hr_store_timings").insert(body.model_dump()).execute()
    return inserted.data[0]


@router.put("/api/store-timings/{timing_id}")
def update_store_timing(timing_id: str, body: StoreTimingCreate, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    updated = supabase.table("hr_store_timings").update(body.model_dump()).eq("id", timing_id).execute()
    return updated.data[0]


@router.delete("/api/store-timings/{timing_id}")
def delete_store_timing(timing_id: str, user: dict = Depends(require_permission("employees.manage", "policy.manage"))):
    supabase.table("hr_store_timings").delete().eq("id", timing_id).execute()
    return {"ok": True}
