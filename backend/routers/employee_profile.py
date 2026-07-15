from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from auth import CONSOLE_ROLES, get_current_user, require_permission, user_can
from database import maybe_single_data, supabase
from models import EmployeeProfileUpdate

router = APIRouter(prefix="/api/employees", tags=["employee-profile"])


def _require_view_access(employee_id: str, user: dict) -> None:
    if user["id"] != employee_id:
        if user["role"] not in CONSOLE_ROLES or not user_can(user, "employees.view"):
            raise HTTPException(status_code=403, detail="Not authorized")


def _employee_exists(employee_id: str) -> bool:
    resp = supabase.table("hr_employees").select("id").eq("id", employee_id).maybe_single().execute()
    return bool(maybe_single_data(resp))


@router.get("/{employee_id}/profile")
def get_employee_profile(employee_id: str, user: dict = Depends(get_current_user)):
    _require_view_access(employee_id, user)
    if not _employee_exists(employee_id):
        raise HTTPException(status_code=404, detail="Employee not found")

    profile_resp = (
        supabase.table("hr_employee_profile").select("*").eq("employee_id", employee_id).maybe_single().execute()
    )
    profile = maybe_single_data(profile_resp) or {"employee_id": employee_id}

    udf_resp = (
        supabase.table("hr_employee_udf")
        .select("*")
        .eq("employee_id", employee_id)
        .order("position")
        .execute()
    )
    profile["udfs"] = [{"udf_name": r["udf_name"], "udf_value": r["udf_value"]} for r in udf_resp.data]
    return profile


@router.put("/{employee_id}/profile")
def update_employee_profile(
    employee_id: str, body: EmployeeProfileUpdate, user: dict = Depends(require_permission("employees.manage"))
):
    if not _employee_exists(employee_id):
        raise HTTPException(status_code=404, detail="Employee not found")

    updates = body.model_dump(exclude_unset=True, exclude={"udfs"})
    for date_field in (
        "date_of_birth", "probation_completion_date", "confirmation_date", "last_promotion_date",
        "next_promotion_date", "gratuity_date", "transfer_date", "marriage_date", "retirement_date",
        "contract_start_date", "contract_end_date", "last_reappointment_date", "last_exit_date_rejoinee",
        "scheduled_exit_date", "exit_date", "settlement_date", "epf_join_date", "eps_join_date", "eps_exit_date",
    ):
        if date_field in updates and updates[date_field] is not None:
            updates[date_field] = updates[date_field].isoformat()

    if "reporting_to_id" in updates:
        updates["reporting_to_id"] = updates["reporting_to_id"] or None

    if updates:
        updates["employee_id"] = employee_id
        updates["updated_at"] = datetime.now(timezone.utc).isoformat()
        supabase.table("hr_employee_profile").upsert(updates, on_conflict="employee_id").execute()

    if body.udfs is not None:
        supabase.table("hr_employee_udf").delete().eq("employee_id", employee_id).execute()
        rows = [
            {"employee_id": employee_id, "udf_name": u.udf_name, "udf_value": u.udf_value, "position": i}
            for i, u in enumerate(body.udfs)
            if u.udf_name or u.udf_value
        ]
        if rows:
            supabase.table("hr_employee_udf").insert(rows).execute()

    return get_employee_profile(employee_id, user)
