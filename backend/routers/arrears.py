from fastapi import APIRouter, Depends, HTTPException

from auth import require_permission
from database import maybe_single_data, supabase
from models import ArrearCreate

router = APIRouter(prefix="/api/arrears", tags=["arrears"])


@router.post("")
def create_arrear(body: ArrearCreate, user: dict = Depends(require_permission("salary.edit"))):
    """One-off arrear line item, independent of hr_salary_structure — see
    sql/051 for why. Picked up by /api/reports/arrears and by payroll's
    period-arrear calculation (routers/payroll.py's
    _fetch_all_arrears_by_employee) for whichever pay period contains
    effective_date."""
    employee = (
        supabase.table("hr_employees").select("id").eq("id", body.employee_id).maybe_single().execute()
    )
    if not maybe_single_data(employee):
        raise HTTPException(status_code=404, detail="Employee not found")
    row = {
        "employee_id": body.employee_id,
        "effective_date": body.effective_date.isoformat(),
        "arrear_amount": body.arrear_amount,
        "remarks": body.remarks,
        "created_by": user["id"],
    }
    inserted = supabase.table("hr_arrears").insert(row).execute()
    return inserted.data[0]


@router.delete("/{arrear_id}")
def delete_arrear(arrear_id: str, user: dict = Depends(require_permission("salary.edit"))):
    supabase.table("hr_arrears").delete().eq("id", arrear_id).execute()
    return {"ok": True}
