from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from config import JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET
from database import supabase

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
    employee = resp.data
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


def get_hr_permissions() -> dict[str, bool]:
    """permission_key -> whether the 'hr' role currently has that capability."""
    resp = supabase.table("hr_permissions").select("permission_key,hr_can_access").execute()
    return {row["permission_key"]: row["hr_can_access"] for row in resp.data}


def user_can(user: dict, *permission_keys: str) -> bool:
    """True if user's role grants any of the given permission keys.
    'accounts' always passes. 'hr' is checked against hr_permissions."""
    if user["role"] == "accounts":
        return True
    if user["role"] != "hr":
        return False
    granted = get_hr_permissions()
    return any(granted.get(key, False) for key in permission_keys)


def require_permission(*permission_keys: str):
    """Dependency factory: accounts always pass; hr must have at least one of the given keys."""

    def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in CONSOLE_ROLES:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin console access required")
        if not user_can(user, *permission_keys):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not permitted — ask Accounts for access")
        return user

    return dep
