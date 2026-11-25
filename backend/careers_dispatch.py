"""Offer-letter + onboarding-link dispatch when a Careers applicant accepts.

Until now Lucky sent both by hand after an applicant moved to "Offer Accepted" or "Hired". This sends them once,
automatically, and records when (hr_careers_dispatch, sql/093) so it can never double-send; the applicant page shows the
status and has a manual "Resend".

Safety:
  * Automatic sending is OFF unless CAREERS_ACCEPT_DISPATCH=on. When off, nothing is sent or recorded; HR uses Resend.
  * Automatic sends respect the careers mail test mode (CAREERS_EMAIL_TEST_ONLY on the careers service, read from its
    /mail/status): a candidate outside the allowlist is skipped. email_service's own HR_MAIL_TEST_ONLY still applies to
    everything, automatic or manual.
  * If sql/093 is not applied the store raises, and the automatic path does nothing (fail closed: never send what we
    cannot record). The manual resend then reports "not recorded" but still sends once on the click.
  * The offer letter goes out only once it has been approved (awaiting the candidate's signature or signed).
"""

import logging
import os
import re
from datetime import datetime, timedelta, timezone

import email_service
from letter_email import HR_CONTACT, build_letter_email_html

logger = logging.getLogger("jade_hr.careers_dispatch")

ACCEPT_STATUSES = {"Offer Accepted", "Hired"}
APP_URL = "https://jade-hr.vercel.app"
ONBOARDING_URL = f"{APP_URL}/onboarding/new"
SENDABLE_APPROVALS = {"awaiting_candidate", "accepted", "signed"}
CLAIM_MINUTES = 5
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def auto_enabled() -> bool:
    return os.environ.get("CAREERS_ACCEPT_DISPATCH", "").strip().lower() == "on"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class DispatchStore:
    """Supabase-backed persistence. Tests pass an in-memory stand-in with the same methods."""

    def __init__(self, supabase):
        self.db = supabase

    def get(self, application_id: int) -> dict | None:
        r = self.db.table("hr_careers_dispatch").select("*").eq("application_id", application_id).limit(1).execute().data
        return (r or [None])[0]

    def claim(self, application_id: int) -> bool:
        """Atomically take the sending slot; False when another request holds a fresh claim."""
        stale = (datetime.now(timezone.utc) - timedelta(minutes=CLAIM_MINUTES)).isoformat()
        if not self.get(application_id):
            try:
                self.db.table("hr_careers_dispatch").insert({"application_id": application_id, "claimed_at": _now()}).execute()
                return True
            except Exception:  # unique violation: lost the race to create it
                pass
        r = (self.db.table("hr_careers_dispatch").update({"claimed_at": _now()}).eq("application_id", application_id)
             .or_(f"claimed_at.is.null,claimed_at.lt.{stale}").execute().data)
        return bool(r)

    def save(self, application_id: int, fields: dict) -> None:
        self.db.table("hr_careers_dispatch").update({**fields, "updated_at": _now()}).eq("application_id", application_id).execute()

    def find_offer_letter(self, email: str) -> dict | None:
        rows = (self.db.table("hr_generated_letters").select("id,title,letter_type,approval_status,rendered_body,created_at")
                .ilike("candidate_email", email.replace("%", "").replace("_", "\\_")).like("letter_type", "offer%")
                .order("created_at", desc=True).limit(1).execute().data)
        return (rows or [None])[0]


def view(row: dict | None) -> dict:
    """What the applicant page shows."""
    if not row:
        return {"state": "not_sent", "auto_enabled": auto_enabled(), "offer_sent_at": None, "onboarding_sent_at": None}
    both = bool(row.get("offer_sent_at") and row.get("onboarding_sent_at"))
    some = bool(row.get("offer_sent_at") or row.get("onboarding_sent_at"))
    return {
        "state": "sent" if both else "partial" if some else "failed" if row.get("last_error") else "not_sent",
        "auto_enabled": auto_enabled(),
        "offer_sent_at": row.get("offer_sent_at"), "onboarding_sent_at": row.get("onboarding_sent_at"),
        "last_error": row.get("last_error"), "sent_by": row.get("sent_by"), "attempts": row.get("attempts") or 0,
    }


def _first(name: str) -> str:
    return (name or "").strip().split(" ")[0] or "there"


def _send_offer(store, app: dict, send) -> tuple[bool, str | None, str | None]:
    letter = store.find_offer_letter(app["email"])
    if not letter:
        return False, "No offer letter has been generated for this email address yet", None
    if letter.get("approval_status") not in SENDABLE_APPROVALS:
        return False, "The offer letter is not approved yet", letter["id"]
    title = letter.get("title") or "Offer Letter"
    cover = (f"Dear {_first(app.get('full_name'))},\n\nCongratulations and welcome to JADE. Your {title} is below for your records. "
             f"Questions? Write to {HR_CONTACT}.")
    html = build_letter_email_html(letter["rendered_body"], cover, title)
    ok, err = send(app["email"], f"Your {title} from JADE Lifestyles India", f"Your {title} from JADE Lifestyles India is in this email.\n",
                   kind="careers_offer_letter", html=html, reply_to=HR_CONTACT, letter_id=letter["id"])
    return bool(ok), err, letter["id"]


def _send_onboarding(app: dict, send) -> tuple[bool, str | None]:
    text = (f"Dear {_first(app.get('full_name'))},\n\nWelcome to JADE. Please complete your onboarding form so we can set up your joining: "
            f"{ONBOARDING_URL}\n\nKeep your ID proofs and bank details handy. Questions? Write to {HR_CONTACT}.\n")
    ok, err = send(app["email"], "Complete your JADE onboarding form", text, kind="careers_onboarding_link", reply_to=HR_CONTACT)
    return bool(ok), err


def dispatch(app: dict, store, *, actor: str, force: bool = False, only: str | None = None, mail_status: dict | None = None,
             send=email_service.send_email_detailed) -> dict:
    """Send what has not been sent yet. app: {id, full_name, email}. force=True is a human clicking Resend: it re-sends
    the chosen part(s) (only='offer'|'onboarding'|None for both) and ignores the auto switch / test mode.
    Returns {"result": ..., "dispatch": view}. Never raises for send problems."""
    email = (app.get("email") or "").strip().lower()
    if not EMAIL_RE.match(email):
        return {"result": "no_valid_email"}
    app = {**app, "email": email}
    if not force:
        if not auto_enabled():
            return {"result": "held", "reason": "CAREERS_ACCEPT_DISPATCH is off"}
        allow = [a.lower() for a in (mail_status or {}).get("test_only") or []]
        if allow and email not in allow:
            return {"result": "held", "reason": "careers mail test mode: candidate not on the allowlist"}
    recordable = True
    row = None
    try:
        row = store.get(app["id"])
    except Exception:
        logger.exception("hr_careers_dispatch unavailable")
        if not force:
            return {"result": "unavailable", "reason": "sql/093 not applied; nothing sent"}
        recordable = False
    if recordable:
        if not force and row and row.get("offer_sent_at") and row.get("onboarding_sent_at"):
            return {"result": "already_sent", "dispatch": view(row)}
        if not store.claim(app["id"]):
            return {"result": "in_progress", "dispatch": view(row)}
    want_offer = only in (None, "offer") and (force or not (row or {}).get("offer_sent_at"))
    want_onb = only in (None, "onboarding") and (force or not (row or {}).get("onboarding_sent_at"))
    fields: dict = {"attempts": ((row or {}).get("attempts") or 0) + 1, "sent_by": actor, "claimed_at": None}
    errors = []
    if want_offer:
        ok, err, letter_id = _send_offer(store, app, send)
        if ok:
            fields.update(offer_sent_at=_now(), offer_letter_id=letter_id)
        else:
            errors.append(f"offer letter: {err}")
    if want_onb:
        ok, err = _send_onboarding(app, send)
        if ok:
            fields["onboarding_sent_at"] = _now()
        else:
            errors.append(f"onboarding link: {err}")
    fields["last_error"] = "; ".join(errors)[:500] or None
    if recordable:
        try:
            store.save(app["id"], fields)
            row = store.get(app["id"])
        except Exception:
            logger.exception("could not record dispatch for %s", app["id"])
    return {"result": "sent" if not errors else "partial", "errors": errors, "dispatch": view({**(row or {}), **fields})}

