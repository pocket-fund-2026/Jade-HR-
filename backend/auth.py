import time
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from config import JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET
from database import maybe_single_data, supabase

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_access_token(employee: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    payload = {
        "sub": employee["employee_code"],
        "id": employee["id"],
        "role": employee["role"],
        "name": f"{employee['first_name']} {employee.get('last_name', '')}".strip(),
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _credentials_error() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise _credentials_error()

    employee_id = payload.get("id")
    if not employee_id:
        raise _credentials_error()

    resp = supabase.table("hr_employees").select("*").eq("id", employee_id).maybe_single().execute()
    employee = maybe_single_data(resp)
    if not employee or not employee["is_active"]:
        raise _credentials_error()

    employee["_claims"] = payload
    return employee


CONSOLE_ROLES = ("accounts", "hr")


def require_console(user: dict = Depends(get_current_user)) -> dict:
    """Any admin-console user (accounts or hr) — endpoint itself decides finer-grained access."""
    if user["role"] not in CONSOLE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin console access required")
    return user


def require_accounts(user: dict = Depends(get_current_user)) -> dict:
    if user["role"] != "accounts":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accounts access required")
    return user


# require_permission() runs on nearly every hr-role request, and previously
# hit Supabase twice per call (role defaults + overrides) with no caching —
# on top of the identity lookup in get_current_user, that was 3 sequential
# network round-trips before an endpoint's own logic even started, on every
# page and every poll. These rarely change, so a short TTL cache removes 2
# of those 3 round-trips almost all of the time. Writes in routers/permissions.py
# call invalidate_permission_cache() so admin changes still apply immediately
# rather than waiting out the TTL.
_PERMISSION_CACHE_TTL = 30  # seconds
_hr_permissions_cache: dict[str, bool] | None = None
_hr_permissions_cache_at = 0.0
_override_cache: dict[str, tuple[float, dict[str, bool]]] = {}


def invalidate_permission_cache(employee_id: str | None = None) -> None:
    global _hr_permissions_cache, _hr_permissions_cache_at
    _hr_permissions_cache = None
    _hr_permissions_cache_at = 0.0
    if employee_id is None:
        _override_cache.clear()
    else:
        _override_cache.pop(employee_id, None)


def get_hr_permissions() -> dict[str, bool]:
    """permission_key -> whether the 'hr' role currently has that capability."""
    global _hr_permissions_cache, _hr_permissions_cache_at
    now = time.monotonic()
    if _hr_permissions_cache is None or now - _hr_permissions_cache_at > _PERMISSION_CACHE_TTL:
        resp = supabase.table("hr_permissions").select("permission_key,hr_can_access").execute()
        _hr_permissions_cache = {row["permission_key"]: row["hr_can_access"] for row in resp.data}
        _hr_permissions_cache_at = now
    return _hr_permissions_cache


def get_permission_overrides(employee_id: str) -> dict[str, bool]:
    """permission_key -> explicit grant/deny for one specific hr-role person,
    layered on top of (and taking priority over) the role-wide default."""
    now = time.monotonic()
    cached = _override_cache.get(employee_id)
    if cached is not None and now - cached[0] <= _PERMISSION_CACHE_TTL:
        return cached[1]
    resp = supabase.table("hr_permission_overrides").select("permission_key,granted").eq("employee_id", employee_id).execute()
    overrides = {row["permission_key"]: row["granted"] for row in resp.data}
    _override_cache[employee_id] = (now, overrides)
    return overrides


def user_can(user: dict, *permission_keys: str) -> bool:
    """True if user's role (or a per-person override) grants any of the given
    permission keys. 'accounts' always passes. 'hr' is checked against
    hr_permission_overrides first, falling back to the role-wide hr_permissions
    default for any key with no override set."""
    if user["role"] == "accounts":
        return True
    if user["role"] != "hr":
        return False
    role_defaults = get_hr_permissions()
    overrides = get_permission_overrides(user["id"])
    for key in permission_keys:
        if key in overrides:
            if overrides[key]:
                return True
        elif role_defaults.get(key, False):
            return True
    return False


def require_permissions_manage(user: dict = Depends(get_current_user)) -> dict:
    """Accounts always; hr only if granted 'permissions.manage' (role-wide or override)."""
    if user["role"] not in CONSOLE_ROLES:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin console access required")
    if user["role"] != "accounts" and not user_can(user, "permissions.manage"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not permitted — ask Accounts for access")
    return user


def require_permission(*permission_keys: str):
    """Dependency factory: accounts always pass; hr must have at least one of the given keys."""

    def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in CONSOLE_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin console access required")
        if not user_can(user, *permission_keys):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not permitted — ask Accounts for access")
        return user

    return dep
