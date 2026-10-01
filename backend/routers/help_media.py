"""Help-page media that must stay behind login. The HR console walkthrough
video shows real console screens (dashboard payroll totals, attendance),
so it lives in the PRIVATE Supabase Storage bucket `help-media` and
signed-in console users get a short-lived signed URL to it. Storage
serves Range requests natively with no size cap, unlike a Vercel function
(4.5 MB response limit). Employee names in it were pseudonymised at
recording time. Bump WALKTHROUGH_OBJECT when re-recording so no browser
mixes cached ranges from an old file with a new one."""

from fastapi import APIRouter, Depends, HTTPException, status

from auth import CONSOLE_ROLES, get_current_user
from database import supabase

router = APIRouter(prefix="/api/help", tags=["help"])

BUCKET = "help-media"
WALKTHROUGH_OBJECT = "hr-console-walkthrough-v2.mp4"
SIGNED_URL_SECONDS = 4 * 3600


@router.get("/walkthrough")
def walkthrough_video(user: dict = Depends(get_current_user)):
    if user["role"] not in CONSOLE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin console access required")
    try:
        signed = supabase.storage.from_(BUCKET).create_signed_url(WALKTHROUGH_OBJECT, SIGNED_URL_SECONDS)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not load the walkthrough video: {e}")
    url = signed.get("signedURL") or signed.get("signedUrl")
    if not url:
        raise HTTPException(status_code=404, detail="Walkthrough video not found")
    return {"url": url, "expires_in": SIGNED_URL_SECONDS}
