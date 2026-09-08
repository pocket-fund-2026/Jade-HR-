from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import require_hr_role
from database import maybe_single_data, supabase
from models import HrTaskCreate, HrTaskUpdate

router = APIRouter(prefix="/api/hr-tasks", tags=["hr-tasks"])

SELECT = "*, assignee:hr_employees!hr_tasks_assigned_to_fkey(first_name,last_name,employee_code)"


@router.get("")
def list_tasks(status: str | None = None, user: dict = Depends(require_hr_role)):
    query = supabase.table("hr_tasks").select(SELECT)
    if status:
        query = query.eq("status", status)
    resp = query.order("created_at", desc=True).execute()
    return resp.data


@router.post("")
def create_task(body: HrTaskCreate, user: dict = Depends(require_hr_role)):
    row = {
        "title": body.title,
        "description": body.description,
        "assigned_to": body.assigned_to,
        "due_date": body.due_date.isoformat() if body.due_date else None,
        "created_by": user["id"],
    }
    inserted = supabase.table("hr_tasks").insert(row).execute()
    task_id = inserted.data[0]["id"]
    resp = supabase.table("hr_tasks").select(SELECT).eq("id", task_id).maybe_single().execute()
    return maybe_single_data(resp)


@router.put("/{task_id}")
def update_task(task_id: str, body: HrTaskUpdate, user: dict = Depends(require_hr_role)):
    existing = supabase.table("hr_tasks").select("id,status").eq("id", task_id).maybe_single().execute()
    if not maybe_single_data(existing):
        raise HTTPException(status_code=404, detail="Task not found")

    row = {}
    if body.title is not None:
        row["title"] = body.title
    if body.description is not None:
        row["description"] = body.description
    if body.assigned_to is not None:
        row["assigned_to"] = body.assigned_to
    if body.due_date is not None:
        row["due_date"] = body.due_date.isoformat()
    if body.status is not None:
        if body.status not in ("open", "done"):
            raise HTTPException(status_code=400, detail="status must be 'open' or 'done'")
        row["status"] = body.status
        row["completed_at"] = datetime.now(timezone.utc).isoformat() if body.status == "done" else None

    supabase.table("hr_tasks").update(row).eq("id", task_id).execute()
    resp = supabase.table("hr_tasks").select(SELECT).eq("id", task_id).maybe_single().execute()
    return maybe_single_data(resp)


@router.delete("/{task_id}")
def delete_task(task_id: str, user: dict = Depends(require_hr_role)):
    supabase.table("hr_tasks").delete().eq("id", task_id).execute()
    return {"ok": True}
