"""Company-wide request visibility for Nimit without approval authority."""

from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user, user_can
from routers.absence import list_absence_requests
from routers.disputes import list_disputes
from routers.leave import list_leave_requests

router = APIRouter(prefix="/api/nimit", tags=["nimit-requests"])


# Legacy login that predates the permission; stays allowed until requests.view_all
# (sql/089) has been granted to them, so nothing locks out during the switch.
LEGACY_CODE = "14456"


def can_view_all_requests(user: dict) -> bool:
    if not user.get("is_active", True):
        return False
    return user.get("employee_code") == LEGACY_CODE or user_can(user, "requests.view_all")


@router.get("/requests")
def all_requests(user: dict = Depends(get_current_user)):
    if not can_view_all_requests(user):
        raise HTTPException(status_code=403, detail="Not authorized")
    return {
        "leave": list_leave_requests(status=None, admin=user),
        "absence": list_absence_requests(status=None, user=user),
        "disputes": list_disputes(status=None, admin=user),
    }
