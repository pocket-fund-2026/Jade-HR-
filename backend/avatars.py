"""Signed photo URLs for lists of people (My Team, Employees). One batched
Storage call for everyone who has a photo, never one per row."""

from database import supabase

AVATAR_BUCKET = "profile-photos"


def attach_avatar_urls(rows: list[dict]) -> list[dict]:
    paths = [r["avatar_path"] for r in rows if r.get("avatar_path")]
    urls: dict[str, str | None] = {}
    if paths:
        try:
            for res in supabase.storage.from_(AVATAR_BUCKET).create_signed_urls(paths, 3600):
                if not res.get("error"):
                    urls[res["path"]] = res.get("signedURL") or res.get("signedUrl")
        except Exception:
            pass
    for r in rows:
        r["avatar_url"] = urls.get(r.pop("avatar_path", None))
    return rows
