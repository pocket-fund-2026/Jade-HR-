"""Geolock for store check-ins. A check-in at a named store counts only within the
store's radius (100 m for Ballard Estate). Pure functions plus a loader that falls back to
a built-in list when hr_geofences does not exist yet (sql/096)."""

import math

from database import supabase

DEFAULT_FENCES = [{
    "id": None, "name": "Ballard Estate, Mint Road", "place_type": "store",
    "address": "128, Mint Rd, Ballard Estate, Fort, Mumbai, Maharashtra 400001",
    "latitude": 18.9366512, "longitude": 72.8391325, "radius_m": 100,
    "center_confirmed": False, "is_active": True,
}]


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def load_fences(active_only: bool = True) -> list[dict]:
    try:
        q = supabase.table("hr_geofences").select("*")
        if active_only:
            q = q.eq("is_active", True)
        return q.execute().data
    except Exception:
        return [dict(f) for f in DEFAULT_FENCES]


def _norm(s: str) -> str:
    return " ".join((s or "").lower().replace(",", " ").split())


def match_fence(place: str, fences: list[dict]) -> dict | None:
    """The fence a typed/selected place refers to: exact name, or one contains the other
    (so 'Ballard Estate' finds 'Ballard Estate, Mint Road')."""
    p = _norm(place)
    if len(p) < 4:
        return None
    for f in fences:
        n = _norm(f["name"])
        if p == n or p in n or n in p:
            return f
    return None


def evaluate(fence: dict, lat: float, lng: float, accuracy: float | None) -> dict:
    """state: verified | outside | imprecise | unconfirmed.
    outside    = even the most favourable reading (distance minus GPS error) is beyond the radius
    imprecise  = could be inside, but the GPS error is too large to say
    unconfirmed= the store's centre has not been confirmed, so nothing can be enforced."""
    if not fence.get("center_confirmed") or fence.get("latitude") is None or fence.get("longitude") is None:
        return {"state": "unconfirmed", "distance_m": None}
    dist = haversine_m(lat, lng, fence["latitude"], fence["longitude"])
    radius = fence.get("radius_m") or 100
    d = int(round(dist))
    if dist <= radius:
        return {"state": "verified", "distance_m": d}
    if accuracy and dist - accuracy <= radius:
        return {"state": "imprecise", "distance_m": d}
    return {"state": "outside", "distance_m": d}
