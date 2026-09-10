from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

import email_service
from auth import get_current_user, require_permission
from database import maybe_single_data, supabase
from models import LoanRequestCreate, LoanResolve

router = APIRouter(tags=["loans"])


@router.post("/api/me/loan-requests")
def create_loan_request(body: LoanRequestCreate, user: dict = Depends(get_current_user)):
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be greater than 0")
    if body.repayment_months < 1:
        raise HTTPException(status_code=400, detail="Repayment months must be at least 1")

    row = {
        "employee_id": user["id"],
        "department": body.department or user.get("department", ""),
        "employee_code": user["employee_code"],
        "first_name": user["first_name"],
        "last_name": user.get("last_name", ""),
        "email": user.get("email", ""),
        "amount": body.amount,
        "reason": body.reason,
        "repayment_months": body.repayment_months,
        "guarantor_name": body.guarantor_name,
        "guarantor_employee_code": body.guarantor_employee_code,
        "guarantor_details": body.guarantor_details,
        "pdc_details": body.pdc_details,
    }
    inserted = supabase.table("hr_loan_requests").insert(row).execute()

    employee_name = f"{user['first_name']} {user.get('last_name', '')}".strip()
    email_service.notify_loan_submitted(
        employee_name, row["department"], body.amount, body.reason, email_service.HR_NOTIFY_EMAIL,
    )

    return inserted.data[0]


@router.get("/api/me/loan-requests")
def my_loan_requests(user: dict = Depends(get_current_user)):
    resp = (
        supabase.table("hr_loan_requests")
        .select("*")
        .eq("employee_id", user["id"])
        .order("created_at", desc=True)
        .execute()
    )
    return resp.data


@router.get("/api/loan-requests")
def list_loan_requests(status: str | None = Query(default=None), user: dict = Depends(require_permission("loans.manage"))):
    query = supabase.table("hr_loan_requests").select(
        "*, hr_employees!hr_loan_requests_employee_id_fkey(first_name,last_name,employee_code,location)"
    )
    if status:
        query = query.eq("status", status)
    return query.order("created_at", desc=True).execute().data


@router.put("/api/loan-requests/{request_id}")
def resolve_loan_request(request_id: str, body: LoanResolve, user: dict = Depends(require_permission("loans.manage"))):
    existing = supabase.table("hr_loan_requests").select("*").eq("id", request_id).maybe_single().execute()
    loan_request = maybe_single_data(existing)
    if not loan_request:
        raise HTTPException(status_code=404, detail="Loan request not found")
    if loan_request["status"] != "pending":
        raise HTTPException(status_code=409, detail="Loan request already resolved")
    if body.action not in ("approve", "reject"):
        raise HTTPException(status_code=400, detail="action must be 'approve' or 'reject'")

    status = "approved" if body.action == "approve" else "rejected"
    supabase.table("hr_loan_requests").update({
        "status": status,
        "admin_note": body.admin_note,
        "resolved_by": user["id"],
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", request_id).execute()

    employee_name = f"{loan_request.get('first_name', '')} {loan_request.get('last_name', '')}".strip()
    email_service.notify_loan_resolved(
        loan_request.get("email", ""), employee_name, status, loan_request["amount"], body.admin_note,
    )

    return {"ok": True}
