"""Help-page media that must stay behind login. The HR console walkthrough
video shows real console screens (dashboard payroll totals, attendance), so
it is served from here to signed-in console users only, never from
frontend/public where anyone with the URL could fetch it. Employee names in
it were pseudonymised at recording time.

Vercel caps a function response at 4.5 MB and the narrated video is
bigger, so every response is a 206 slice of at most CHUNK bytes — even
for "bytes=0-" or no Range header at all. Video elements handle short
206 responses natively and fetch the rest as they play or seek."""

from pathlib import Path

import re

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from auth import CONSOLE_ROLES, get_current_user

router = APIRouter(prefix="/api/help", tags=["help"])

ASSETS = Path(__file__).resolve().parent.parent / "assets"
CHUNK = 2 * 1024 * 1024
RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


@router.get("/walkthrough.mp4")
def walkthrough_video(request: Request, user: dict = Depends(get_current_user)):
    if user["role"] not in CONSOLE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin console access required")
    path = ASSETS / "hr-console-walkthrough.mp4"
    if not path.exists():
        raise HTTPException(status_code=404, detail="Walkthrough video not found")
    size = path.stat().st_size
    start, end = 0, size - 1
    m = RANGE_RE.fullmatch((request.headers.get("range") or "").strip())
    if m:
        if m.group(1):
            start = int(m.group(1))
            if m.group(2):
                end = min(int(m.group(2)), size - 1)
        elif m.group(2):  # suffix range: last N bytes
            start = max(size - int(m.group(2)), 0)
    if start >= size or start > end:
        return Response(status_code=416, headers={"Content-Range": f"bytes */{size}"})
    end = min(end, start + CHUNK - 1)
    with path.open("rb") as f:
        f.seek(start)
        data = f.read(end - start + 1)
    return Response(
        content=data,
        status_code=206,
        media_type="video/mp4",
        headers={
            "Content-Range": f"bytes {start}-{end}/{size}",
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=86400",
        },
    )
