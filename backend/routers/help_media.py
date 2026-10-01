"""Help-page media that must stay behind login. The HR console walkthrough
video shows real console screens (dashboard payroll totals, attendance), so
it is served from here to signed-in console users only, never from
frontend/public where anyone with the URL could fetch it. Employee names in
it were pseudonymised at recording time. FileResponse handles Range
requests, so the browser can seek without downloading the whole file."""

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from auth import CONSOLE_ROLES, get_current_user

router = APIRouter(prefix="/api/help", tags=["help"])

ASSETS = Path(__file__).resolve().parent.parent / "assets"


@router.get("/walkthrough.mp4")
def walkthrough_video(user: dict = Depends(get_current_user)):
    if user["role"] not in CONSOLE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin console access required")
    path = ASSETS / "hr-console-walkthrough.mp4"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Walkthrough video not found")
    return FileResponse(path, media_type="video/mp4", headers={"Cache-Control": "private, max-age=86400"})
