"""Company-wide request visibility for Nimit without approval authority."""

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user
from routers.absence import list_absence_requests
from routers.disputes import list_disputes
from routers.leave import list_leave_requests

router = APIRouter(prefix="/api/nimit", tags=["nimit-requests"])


@router.get("/requests")
def all_requests(user: dict = Depends(get_current_user)):
    if user.get("employee_code") != "14456" or not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="Not authorized")
    return {
        "leave": list_leave_requests(status=None, admin=user),
        "absence": list_absence_requests(status=None, user=user),
        "disputes": list_disputes(status=None, admin=user),
    }
