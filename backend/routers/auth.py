import base64
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from activity import record_login
from jose import JWTError, jwt

import email_service
from auth import COOKIE_NAME, _password_fingerprint, create_access_token, get_current_user, hash_password, verify_password
from config import COOKIE_SECURE, JWT_ALGORITHM, JWT_EXPIRE_MINUTES, JWT_SECRET
from database import maybe_single_data, supabase
from models import AvatarUpload, BootstrapAdminRequest, ForgotPasswordRequest, LoginRequest, PasswordChange, ResetPasswordRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES = 15
RESET_LINK_MINUTES = 30
RESET_URL = "https://jade-hr.vercel.app/reset-password"
FORGOT_REPLY = {
    "ok": True,
    "message": "If that employee code has an email address on file, a reset link has been sent to it. "
               "No email on file? Ask HR to reset your password.",
}


def _set_session_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=JWT_EXPIRE_MINUTES * 60,
        path="/",
    )


@router.post("/login")
def login(body: LoginRequest, response: Response, request: Request):
    resp = (
        supabase.table("hr_employees")
        .select("*")
        .eq("employee_code", body.employee_code)
        .maybe_single()
        .execute()
    )
    employee = maybe_single_data(resp)
    if not employee or not employee["is_active"]:
        raise HTTPException(status_code=401, detail="Invalid employee code or password")

    locked_until = employee.get("locked_until")
    if locked_until:
        locked_until_dt = datetime.fromisoformat(locked_until)
        remaining = (locked_until_dt - datetime.now(timezone.utc)).total_seconds()
        if remaining > 0:
            raise HTTPException(
                status_code=423,
                detail=f"Too many failed attempts. Try again in {max(1, int(remaining // 60) + 1)} minute(s).",
            )

    if not verify_password(body.password, employee["password_hash"]):
        new_count = employee.get("failed_login_count", 0) + 1
        updates = {"failed_login_count": new_count}
        if new_count >= MAX_FAILED_ATTEMPTS:
            updates["failed_login_count"] = 0
            updates["locked_until"] = (datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_MINUTES)).isoformat()
        supabase.table("hr_employees").update(updates).eq("id", employee["id"]).execute()
        left = MAX_FAILED_ATTEMPTS - new_count
        if new_count >= MAX_FAILED_ATTEMPTS:
            raise HTTPException(
                status_code=423,
                detail=f"Too many failed attempts. Try again in {LOCKOUT_MINUTES} minutes, or ask HR to reset your password.",
            )
        if left <= 2:
            raise HTTPException(
                status_code=401,
                detail=f"Invalid employee code or password. {left} attempt(s) left before a {LOCKOUT_MINUTES}-minute lock.",
            )
        raise HTTPException(status_code=401, detail="Invalid employee code or password")

    if employee.get("failed_login_count", 0) > 0 or employee.get("locked_until"):
        supabase.table("hr_employees").update(
            {"failed_login_count": 0, "locked_until": None}
        ).eq("id", employee["id"]).execute()

    record_login(employee, request.headers.get("user-agent", ""))
    token = create_access_token(employee)
    _set_session_cookie(response, token)
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": employee["role"],
        "name": f"{employee['first_name']} {employee.get('last_name', '')}".strip(),
    }


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest):
    """Self-service recovery. Always returns the same reply so it cannot be used
    to discover which employee codes exist. The link is a short-lived signed
    token tied to the current password hash, so it works once."""
    resp = supabase.table("hr_employees").select("*").eq("employee_code", body.employee_code).maybe_single().execute()
    employee = maybe_single_data(resp)
    if not employee or not employee.get("is_active"):
        return FORGOT_REPLY
    recipient = (employee.get("email") or "").strip()
    if not recipient:
        prof = maybe_single_data(
            supabase.table("hr_employee_profile").select("personal_email_id").eq("employee_id", employee["id"]).maybe_single().execute()
        ) or {}
        recipient = (prof.get("personal_email_id") or "").strip()
    name = f"{employee['first_name']} {employee.get('last_name') or ''}".strip()
    if not recipient:
        email_service.send_email(
            email_service.HR_NOTIFY_EMAIL,
            f"Password reset needed for {name} ({employee['employee_code']})",
            f"{name} ({employee['employee_code']}) tried to reset their password but has no email address on file. "
            "Please reset it from their employee record and tell them.",
            kind="password_reset_no_email",
        )
        return FORGOT_REPLY
    token = jwt.encode(
        {
            "purpose": "pwreset", "id": employee["id"], "pv": _password_fingerprint(employee["password_hash"]),
            "exp": datetime.now(timezone.utc) + timedelta(minutes=RESET_LINK_MINUTES),
        },
        JWT_SECRET, algorithm=JWT_ALGORITHM,
    )
    email_service.send_email(
        recipient,
        "Reset your JADE HR password",
        f"Hi {name},\n\nUse this link to choose a new password (valid for {RESET_LINK_MINUTES} minutes, one use):\n"
        f"{RESET_URL}?token={token}\n\nIf you didn't ask for this, ignore this email; your password is unchanged.\n",
        kind="password_reset",
    )
    return FORGOT_REPLY


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest):
    bad = HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")
    try:
        payload = jwt.decode(body.token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except JWTError:
        raise bad
    if payload.get("purpose") != "pwreset":
        raise bad
    if len(body.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    employee = maybe_single_data(supabase.table("hr_employees").select("*").eq("id", payload.get("id")).maybe_single().execute())
    if not employee or not employee.get("is_active") or _password_fingerprint(employee["password_hash"]) != payload.get("pv"):
        raise bad  # already used (password changed since) or account gone
    supabase.table("hr_employees").update(
        {
            "password_hash": hash_password(body.password),
            "failed_login_count": 0,
            "locked_until": None,
            "password_changed_by_employee": True,
        }
    ).eq("id", employee["id"]).execute()
    return {"ok": True}


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"ok": True}


@router.post("/change-password")
def change_password(body: PasswordChange, response: Response, user: dict = Depends(get_current_user)):
    """Self-service password change — available to EVERY authenticated user
    (employees and console users alike), for their own account only. Requires
    the current password; distinct from the admin-only reset at
    PUT /api/employees/{id}/password which sets another person's password."""
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    new_hash = hash_password(body.new_password)
    supabase.table("hr_employees").update(
        {
            "password_hash": new_hash,
            "failed_login_count": 0,
            "locked_until": None,
            "password_changed_by_employee": True,
        }
    ).eq("id", user["id"]).execute()
    # The old cookie's "pv" fingerprint no longer matches — issue a fresh one so
    # the user changing their own password isn't immediately logged out by it.
    user["password_hash"] = new_hash
    _set_session_cookie(response, create_access_token(user))
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    user.pop("password_hash", None)
    user.pop("_claims", None)
    # Two independent tables — fires on ~every page load across the whole
    # console, so it's worth collapsing to one round-trip's wait instead of two.
    # (A third, hr_employee_profile.head_of_department, used to be resolved
    # here too as is_head_of_department, but nothing ever consumed it — the
    # HOD-based reporting-manager lookup it was meant for was abandoned in
    # favor of reporting_to_id/reporting_to_email, see payroll.py's
    # _reporting_manager_emails — so it was a dead extra query on every call.)
    with ThreadPoolExecutor(max_workers=2) as pool:
        direct_future = pool.submit(
            lambda: supabase.table("hr_employees").select("id").eq("leave_approver_id", user["id"]).limit(1).execute()
        )
        reporting_future = pool.submit(
            lambda: supabase.table("hr_employee_profile").select("employee_id").eq("reporting_to_id", user["id"]).limit(1).execute()
        )
        direct_resp = direct_future.result()
        reporting_resp = reporting_future.result()
    user["is_leave_approver"] = bool(direct_resp.data or reporting_resp.data)
    user["avatar_url"] = _avatar_url(user.get("avatar_path"))
    return user


AVATAR_BUCKET = "profile-photos"
AVATAR_MAX_BYTES = 1_000_000  # the browser sends ~20 KB; this is only a ceiling
AVATAR_TYPES = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def _avatar_url(path: str | None) -> str | None:
    if not path:
        return None
    try:
        res = supabase.storage.from_(AVATAR_BUCKET).create_signed_url(path, 3600)
        return res.get("signedURL") or res.get("signedUrl")
    except Exception:
        return None


@router.post("/me/avatar")
def upload_avatar(body: AvatarUpload, user: dict = Depends(get_current_user)):
    ext = AVATAR_TYPES.get(body.content_type)
    if not ext:
        raise HTTPException(status_code=400, detail="Use a JPG, PNG or WebP image")
    try:
        data = base64.b64decode(body.content_base64.split(",", 1)[-1])
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid image data")
    if len(data) > AVATAR_MAX_BYTES:
        raise HTTPException(status_code=400, detail="Image is too large")
    # A new filename each time so the browser never shows a cached old photo.
    path = f"{user['id']}/{int(datetime.now(timezone.utc).timestamp())}.{ext}"
    try:
        supabase.storage.from_(AVATAR_BUCKET).upload(path, data, {"content-type": body.content_type})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upload failed: {e}")
    old = user.get("avatar_path")
    supabase.table("hr_employees").update({"avatar_path": path}).eq("id", user["id"]).execute()
    if old:
        try:
            supabase.storage.from_(AVATAR_BUCKET).remove([old])
        except Exception:
            pass
    return {"avatar_url": _avatar_url(path)}


@router.delete("/me/avatar")
def delete_avatar(user: dict = Depends(get_current_user)):
    old = user.get("avatar_path")
    supabase.table("hr_employees").update({"avatar_path": None}).eq("id", user["id"]).execute()
    if old:
        try:
            supabase.storage.from_(AVATAR_BUCKET).remove([old])
        except Exception:
            pass
    return {"ok": True}


@router.post("/bootstrap-admin")
def bootstrap_admin(body: BootstrapAdminRequest, response: Response):
    """Creates the first account, as 'accounts' (full access, controls what HR
    can see). Only works while hr_employees is empty."""
    existing = supabase.table("hr_employees").select("id").limit(1).execute()
    if existing.data:
        raise HTTPException(status_code=403, detail="Setup already completed — an account already exists")

    row = {
        "employee_code": body.employee_code,
        "first_name": body.first_name,
        "last_name": body.last_name,
        "role": "accounts",
        "password_hash": hash_password(body.password),
        "basic": 0,
        "hra": 0,
        "conveyance": 0,
    }
    inserted = supabase.table("hr_employees").insert(row).execute()
    employee = inserted.data[0]
    token = create_access_token(employee)
    _set_session_cookie(response, token)
    return {"access_token": token, "token_type": "bearer", "role": "accounts"}
