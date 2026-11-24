from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from arrears_calc import REASONS, calculate_revision_arrear
from auth import require_permission
from database import maybe_single_data, supabase
from models import ArrearCalcRequest, ArrearCancel, ArrearCreate

router = APIRouter(prefix="/api/arrears", tags=["arrears"])

COLUMNS = (
    "id,employee_id,pay_year,pay_month,arrear_amount,tds_amount,reason,period_from,period_to,"
    "remarks,status,created_by,created_at,approved_by,approved_at,cancelled_by,cancelled_at,cancel_reason,effective_date"
)


def fetch_approved_arrears(year: int, month: int, employee_id: str | None = None) -> dict[str, list[dict]]:
    """Approved hr_arrears rows paid in pay period (year, month), keyed by
    employee_id. Used by payroll to add arrears to net pay. Errors propagate:
    this is money, so it must fail loudly rather than silently pay short."""
    query = (
        supabase.table("hr_arrears")
        .select("employee_id,arrear_amount,tds_amount")
        .eq("pay_year", year)
        .eq("pay_month", month)
        .eq("status", "approved")
    )
    if employee_id:
        query = query.eq("employee_id", employee_id)
    by_employee: dict[str, list[dict]] = {}
    for r in query.execute().data or []:
        by_employee.setdefault(r["employee_id"], []).append(r)
    return by_employee


@router.get("")
def list_arrears(
    pay_year: int | None = Query(default=None),
    pay_month: int | None = Query(default=None, ge=1, le=12),
    status: str | None = Query(default=None),
    employee_id: str | None = Query(default=None),
    user: dict = Depends(require_permission("payroll.view")),
):
    """Arrears with employee + actor names, newest first — Accounts' working list."""
    query = supabase.table("hr_arrears").select(COLUMNS)
    if pay_year:
        query = query.eq("pay_year", pay_year)
    if pay_month:
        query = query.eq("pay_month", pay_month)
    if status:
        query = query.eq("status", status)
    if employee_id:
        query = query.eq("employee_id", employee_id)
    rows = query.order("created_at", desc=True).limit(2000).execute().data or []
    if not rows:
        return []
    ids = {r["employee_id"] for r in rows}
    for key in ("created_by", "approved_by", "cancelled_by"):
        ids |= {r[key] for r in rows if r.get(key)}
    people = (
        supabase.table("hr_employees")
        .select("id,employee_code,first_name,last_name,location")
        .in_("id", list(ids))
        .execute()
        .data
    )
    by_id = {p["id"]: p for p in people}

    def name(pid):
        p = by_id.get(pid)
        return f"{p['first_name']} {p.get('last_name') or ''}".strip() if p else ""

    result = []
    for r in rows:
        e = by_id.get(r["employee_id"])
        if not e:
            continue
        result.append({
            **r,
            "employee_code": e["employee_code"],
            "name": name(r["employee_id"]),
            "location": e.get("location", ""),
            "net_effect": round(float(r["arrear_amount"] or 0) - float(r["tds_amount"] or 0), 2),
            "created_by_name": name(r.get("created_by")),
            "approved_by_name": name(r.get("approved_by")),
            "cancelled_by_name": name(r.get("cancelled_by")),
        })
    return result


@router.post("/calculate")
def calculate(body: ArrearCalcRequest, user: dict = Depends(require_permission("payroll.view"))):
    """Working for a retroactive pay revision: (new - old) monthly, pro-rated
    by days across each pay period in the range. Does not save anything."""
    try:
        return calculate_revision_arrear(body.old_monthly, body.new_monthly, body.from_date, body.to_date)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("")
def create_arrear(body: ArrearCreate, user: dict = Depends(require_permission("salary.edit"))):
    if body.reason not in REASONS:
        raise HTTPException(status_code=400, detail=f"Reason must be one of: {', '.join(REASONS)}")
    if not body.arrear_amount:
        raise HTTPException(status_code=400, detail="Arrear amount cannot be zero")
    if body.tds_amount and body.tds_amount > abs(body.arrear_amount):
        raise HTTPException(status_code=400, detail="TDS cannot exceed the arrear amount")
    if body.period_from and body.period_to and body.period_to < body.period_from:
        raise HTTPException(status_code=400, detail="'Relates to' end date is before its start date")
    employee = (
        supabase.table("hr_employees").select("id").eq("id", body.employee_id).maybe_single().execute()
    )
    if not maybe_single_data(employee):
        raise HTTPException(status_code=404, detail="Employee not found")

    # Duplicate guard: same employee, pay period, amount and reason, still live.
    dup = (
        supabase.table("hr_arrears").select("id")
        .eq("employee_id", body.employee_id).eq("pay_year", body.pay_year).eq("pay_month", body.pay_month)
        .eq("arrear_amount", body.arrear_amount).eq("reason", body.reason).neq("status", "cancelled")
        .execute().data
    )
    if dup:
        raise HTTPException(
            status_code=409,
            detail="An identical arrear (same employee, pay month, amount, reason) already exists — cancel it first if this is a correction",
        )

    now = datetime.now(timezone.utc).isoformat()
    row = {
        "employee_id": body.employee_id,
        "pay_year": body.pay_year,
        "pay_month": body.pay_month,
        "effective_date": (body.period_from or datetime.now(timezone.utc).date()).isoformat(),
        "arrear_amount": body.arrear_amount,
        "tds_amount": body.tds_amount,
        "reason": body.reason,
        "period_from": body.period_from.isoformat() if body.period_from else None,
        "period_to": body.period_to.isoformat() if body.period_to else None,
        "remarks": body.remarks,
        "status": "approved" if body.approve_now else "pending",
        "created_by": user["id"],
    }
    if body.approve_now:
        row.update({"approved_by": user["id"], "approved_at": now})
    return supabase.table("hr_arrears").insert(row).execute().data[0]


def _load(arrear_id: str) -> dict:
    row = maybe_single_data(supabase.table("hr_arrears").select(COLUMNS).eq("id", arrear_id).maybe_single().execute())
    if not row:
        raise HTTPException(status_code=404, detail="Arrear not found")
    return row


@router.post("/{arrear_id}/approve")
def approve_arrear(arrear_id: str, user: dict = Depends(require_permission("salary.edit"))):
    row = _load(arrear_id)
    if row["status"] != "pending":
        raise HTTPException(status_code=409, detail=f"Only pending arrears can be approved (this one is {row['status']})")
    upd = {"status": "approved", "approved_by": user["id"], "approved_at": datetime.now(timezone.utc).isoformat()}
    return supabase.table("hr_arrears").update(upd).eq("id", arrear_id).eq("status", "pending").execute().data[0]


@router.post("/{arrear_id}/cancel")
def cancel_arrear(arrear_id: str, body: ArrearCancel, user: dict = Depends(require_permission("salary.edit"))):
    """Cancel rather than delete: keeps the audit trail. A cancelled arrear
    stops counting in payroll immediately."""
    row = _load(arrear_id)
    if row["status"] == "cancelled":
        raise HTTPException(status_code=409, detail="Already cancelled")
    upd = {
        "status": "cancelled", "cancelled_by": user["id"],
        "cancelled_at": datetime.now(timezone.utc).isoformat(), "cancel_reason": body.reason,
    }
    return supabase.table("hr_arrears").update(upd).eq("id", arrear_id).execute().data[0]
