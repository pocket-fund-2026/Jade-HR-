"""Pure helpers behind the Careers router: who can interview, how an interviewer's own availability is fenced to them,
and the round-2 notes email. Kept free of FastAPI/Supabase so they are unit-testable."""

import re

STORE_MANAGER_RE = re.compile(r"store\s*manager|boutique\s*manager|showroom\s*manager", re.I)
EMAIL_RE = re.compile(r"^[^@\s]{1,64}@[^@\s.]{1,255}(?:\.[^@\s.]{1,63}){1,8}$")  # no overlapping quantifiers: linear time


def full_name(emp: dict) -> str:
    return f"{emp.get('first_name') or ''} {emp.get('last_name') or ''}".strip()


def interviewer_reason(emp: dict, manager_ids: set[str]) -> str | None:
    """Why this employee can be an interviewer: they manage people, or they run a store."""
    reasons = []
    if emp.get("id") in manager_ids:
        reasons.append("Reporting manager")
    if STORE_MANAGER_RE.search(emp.get("designation") or ""):
        reasons.append("Store manager")
    return " + ".join(reasons) or None


def build_interviewers(employees: list[dict], manager_ids: set[str]) -> list[dict]:
    """Active employees with a work email who are reporting managers (someone's leave approver / reporting_to) or
    store managers. Sorted by name; one row per person."""
    out = []
    for emp in employees:
        if emp.get("is_active") is False:
            continue
        email = (emp.get("email") or "").strip().lower()
        reason = interviewer_reason(emp, manager_ids)
        if not email or not EMAIL_RE.match(email) or not reason:
            continue
        out.append({
            "id": emp["id"], "name": full_name(emp), "email": email, "designation": emp.get("designation") or "",
            "location": emp.get("location") or "", "reason": reason,
        })
    return sorted(out, key=lambda r: r["name"].lower())


def own_availability(rows: list[dict], email: str) -> list[dict]:
    """Interviewers only ever see and edit rows keyed to their own email."""
    e = (email or "").strip().lower()
    return [r for r in rows if e and (r.get("email") or "").strip().lower() == e]


def fence_availability_body(body: dict, user: dict, existing_rows: list[dict]) -> dict:
    """Force a saved availability to the signed-in person: their email and name, and the id of their existing row (so
    posting never edits someone else's row, whatever id the client sent)."""
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise ValueError("Your account has no work email, so availability cannot be saved. Ask HR to add it.")
    mine = own_availability(existing_rows, email)
    fenced = {k: v for k, v in body.items() if k not in ("id", "email", "name")}
    fenced["email"] = email
    fenced["name"] = full_name(user) or user.get("name") or email
    if mine:
        fenced["id"] = mine[0]["id"]
    return fenced


def owns_availability(rows: list[dict], email: str, avail_id: int) -> bool:
    return any(r.get("id") == avail_id for r in own_availability(rows, email))


def compose_round2_email(*, candidate: str, role: str, notes: str, source_label: str | None, source_url: str | None,
                         sender: str, message: str = "") -> tuple[str, str]:
    """(subject, plain-text body) for passing round-1 notes to the round-2 interviewer."""
    subject = f"Interview notes: {candidate}" + (f" ({role})" if role else "")
    lines = [f"{sender} shared the first-round interview notes for {candidate}" + (f", applying for {role}." if role else ".")]
    if (message or "").strip():
        lines += ["", message.strip()]
    if source_url:
        lines += ["", f"Full notes{f' ({source_label})' if source_label else ''}: {source_url}"]
    if (notes or "").strip():
        lines += ["", "Notes", "-----", notes.strip()]
    lines += ["", "This was sent from the JADE HR Careers console."]
    return subject, "\n".join(lines) + "\n"
