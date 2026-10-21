"""Automated new-joiner onboarding pipeline.

    offer letter signed (routers/offers.py)
      -> NDA emailed to the joiner to e-sign
      -> joiner signs: Dev is emailed to countersign, and the joiner gets the
         employee details form link (/onboarding/new?c=<token>)
      -> form submitted -> HR approves it (routers/onboarding.py creates the
         employee record)
      -> joiner arrives, HR sets the work email in the console
      -> biometric enrolment form emailed to Laki (JADE HR) with a link to
         confirm enrolment; the joiner gets a Slack invite (plus the analyst
         onboarding document when the role is an analyst)
      -> every step done: the reporting manager gets a Slack message (email
         fallback) that onboarding is complete
    A daily cron (onboarding_escalation_notify.py) emails Gaurav anything
    stuck or missed.

No new tables: the HR database now runs a fenced local primary with a
Supabase standby (backend/ha.py), and only replicated tables can be written.
So a case is an hr_generated_letters row with letter_type CASE_TYPE whose
field_values holds the pipeline state (candidate_token = form link token,
approver_token = biometric form token), the NDA is an ordinary letter row
(letter_type "nda"), and the settings live in hr_letter_templates under
SETTINGS_KEY. Both private keys start with "_" and are hidden from the
Letters page."""

import html as html_lib
import json
import logging
import os
import re
import secrets
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta, timezone

import email_service
from database import maybe_single_data, supabase
from letter_email import HR_CONTACT, build_letter_email_html

logger = logging.getLogger(__name__)

APP_URL = "https://jade-hr.vercel.app"
CASE_TYPE = "_onboarding_case"
SETTINGS_KEY = "_onboarding_settings"
NDA_TYPE = "nda"
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ANALYST_RE = re.compile(r"\banalyst\b", re.I)

DEFAULT_SETTINGS = {
    "dev_name": "Dev Shah",
    "dev_email": "dev@pocket-fund.com",
    "dev_title": "Authorised Signatory",
    "biometric_name": "Laki Gupta",
    "biometric_email": "laki@jadecouture.com",
    "escalation_name": "Gaurav",
    "escalation_email": "",
    "escalate_after_days": 2,
    "slack_invite_link": "",
    "slack_bot_token": "",
    "slack_admin_token": "",
    "slack_team_id": "",
    "analyst_doc_url": "",
    "analyst_doc_name": "Analyst Onboarding Document",
}
SECRET_SETTINGS = ("slack_bot_token", "slack_admin_token")

NDA_TITLE = "Non-Disclosure Agreement"
NDA_TEMPLATE = """\
<p class="lt-dateline"><span>Mumbai</span><span><strong>{{letter_date}}</strong></span></p>
<p class="lt-title">Non-Disclosure Agreement</p>
<p>This Non-Disclosure Agreement ("Agreement") is entered into on {{letter_date}} between <strong>{{company_name}}</strong>, having its office at Mumbai ("the Company"), and <strong>{{employee_name}}</strong> ("the Employee"), joining the Company as {{designation}}{{department_suffix}}.</p>
<p>In the course of employment the Employee will receive information about the Company's business. In consideration of that employment and access, the Employee agrees to the following.</p>
<p class="lt-heading">1. Confidential Information</p>
<p>"Confidential Information" means all information disclosed to or accessed by the Employee, whether oral, written or electronic, that is marked confidential or that reasonably should be understood to be confidential. It includes, without limitation, designs, collections and sketches before launch, client and customer data, supplier and karigar details, pricing and costing, sales and financial information, business plans, marketing plans, internal systems, software and data.</p>
<p>It excludes information that (a) is or becomes public other than through a breach by the Employee, (b) was rightfully known to the Employee before joining, (c) is independently developed without use of the Company's information, or (d) is required to be disclosed by law, in which case the Employee will inform the Company first where lawful.</p>
<p class="lt-heading">2. Use and protection</p>
<ol>
<li>Use Confidential Information only to perform duties for the Company.</li>
<li>Not disclose it to anyone outside the Company, or inside it without a genuine need to know.</li>
<li>Not copy, photograph, forward to personal accounts or remove Company information or materials except as the role requires.</li>
<li>Not use it to compete with the Company or for personal benefit.</li>
<li>Take all reasonable steps to keep it secure, and report any loss or unauthorised disclosure to HR immediately.</li>
</ol>
<p class="lt-heading">3. Clients, suppliers and non-circumvention</p>
<p>During employment and for twelve (12) months after it ends, the Employee shall not directly or indirectly solicit, deal with or divert any client, supplier, karigar or business contact introduced through the Company for a competing purpose, or bypass the Company in any business opportunity connected with its Confidential Information.</p>
<p class="lt-heading">4. Ownership and return</p>
<p>All Confidential Information and all work product, designs and materials created in the course of employment remain the property of the Company. No licence or other right is granted. On leaving the Company, or at its request, the Employee will return or destroy all Company information and materials, including copies, and confirm this in writing if asked.</p>
<p class="lt-heading">5. Term</p>
<p>These obligations apply from the date of signing, continue throughout employment and survive its end for as long as the information remains confidential, and in any case for no less than two (2) years after the employment ends.</p>
<p class="lt-heading">6. Remedies</p>
<p>The Employee acknowledges that a breach may cause the Company irreparable harm and that the Company may seek injunctive relief in addition to any other remedy available in law, including disciplinary action up to termination.</p>
<p class="lt-heading">7. General</p>
<p>This Agreement is governed by the laws of India and is subject to the exclusive jurisdiction of the courts at Mumbai. If any provision is unenforceable, the rest remains in effect. It may be changed only in writing signed by both parties, and may be signed electronically.</p>
<div class="lt-sign"><p>For <strong>{{company_name}}</strong></p><div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>{{signatory_name}}</strong></span><br><span class="lt-sign-meta">{{signatory_title}}</span></p></div>
<div class="lt-sign"><p>Employee</p><div class="lt-sign-space"></div><p><span class="lt-sign-name"><strong>{{employee_name}}</strong></span><br><span class="lt-sign-meta">{{designation}}</span></p></div>
"""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_label() -> str:
    d = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    day = d.day
    suffix = "th" if 11 <= day <= 13 else {1: "st", 2: "nd", 3: "rd"}.get(day % 10, "th")
    return f"{day}{suffix} {d.strftime('%B %Y')}"


def _first(name: str) -> str:
    return (name or "").strip().split(" ")[0] or "there"


def parse_date(value) -> str:
    """Offer letters hold the joining date as typed text ("25th August
    2025"); store ISO when it parses, '' otherwise."""
    if not value:
        return ""
    if isinstance(value, date):
        return value.isoformat()
    text = re.sub(r"(\d)(st|nd|rd|th)\b", r"\1", str(value).strip(), flags=re.I).replace(",", " ")
    text = " ".join(text.split())
    for fmt in ("%Y-%m-%d", "%d %B %Y", "%d %b %Y", "%B %d %Y", "%b %d %Y", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y"):
        try:
            return datetime.strptime(text, fmt).date().isoformat()
        except ValueError:
            continue
    return ""


def _fmt_date(iso: str) -> str:
    try:
        return date.fromisoformat(iso).strftime("%d %b %Y")
    except (TypeError, ValueError):
        return iso or "not set"


# ── settings ────────────────────────────────────────────────────────────

def get_settings() -> dict:
    row = maybe_single_data(
        supabase.table("hr_letter_templates").select("body").eq("letter_type", SETTINGS_KEY).maybe_single().execute()
    )
    stored = {}
    if row:
        try:
            stored = json.loads(row["body"] or "{}")
        except ValueError:
            stored = {}
    settings = {**DEFAULT_SETTINGS, **{k: v for k, v in stored.items() if k in DEFAULT_SETTINGS}}
    for key, env in (("slack_bot_token", "SLACK_BOT_TOKEN"), ("slack_admin_token", "SLACK_ADMIN_TOKEN"), ("slack_team_id", "SLACK_TEAM_ID")):
        if os.environ.get(env):
            settings[key] = os.environ[env]
    return settings


def public_settings() -> dict:
    s = get_settings()
    for key in SECRET_SETTINGS:
        s[key + "_set"] = bool(s.get(key))
        s[key] = ""
    return s


def save_settings(changes: dict, user_id: str | None) -> dict:
    current = get_settings()
    for key, value in changes.items():
        if key not in DEFAULT_SETTINGS:
            continue
        if key in SECRET_SETTINGS and not value:
            continue  # blank means "keep the saved token"
        if key == "escalate_after_days":
            value = max(1, min(30, int(value or 2)))
        elif isinstance(value, str):
            value = value.strip()
            if key.endswith("_email") and value:
                value = value.lower()
                if not EMAIL_RE.match(value):
                    raise ValueError(f"'{value}' is not a valid email address")
        current[key] = value
    supabase.table("hr_letter_templates").upsert({
        "letter_type": SETTINGS_KEY, "title": "Onboarding pipeline settings", "body": json.dumps(current),
        "updated_by": user_id, "updated_at": _now(),
    }, on_conflict="letter_type").execute()
    return public_settings()


# ── case storage ────────────────────────────────────────────────────────

def _row_to_case(row: dict) -> dict:
    case = dict(row.get("field_values") or {})
    case["id"] = row["id"]
    case["created_at"] = row.get("created_at")
    case["status"] = row.get("approval_status") or "active"
    case["employee_id"] = row.get("employee_id")
    return case


def get_case(case_id: str) -> dict | None:
    row = maybe_single_data(
        supabase.table("hr_generated_letters").select("*").eq("id", case_id).eq("letter_type", CASE_TYPE).maybe_single().execute()
    )
    return _row_to_case(row) if row else None


def _case_by(column: str, value: str) -> dict | None:
    if not value:
        return None
    rows = supabase.table("hr_generated_letters").select("*").eq("letter_type", CASE_TYPE).eq(column, value).limit(1).execute().data
    return _row_to_case(rows[0]) if rows else None


def case_by_form_token(token: str) -> dict | None:
    return _case_by("candidate_token", token)


def case_by_biometric_token(token: str) -> dict | None:
    return _case_by("approver_token", token)


def case_by_field(key: str, value: str) -> dict | None:
    return _case_by(f"field_values->>{key}", value)


def list_cases() -> list[dict]:
    rows = (
        supabase.table("hr_generated_letters").select("*").eq("letter_type", CASE_TYPE)
        .order("created_at", desc=True).limit(300).execute().data or []
    )
    return [_row_to_case(r) for r in rows]


STATE_SKIP = ("id", "created_at", "status", "employee_id", "steps", "issues", "manager", "is_complete")


def save_case(case: dict) -> dict:
    state = {k: v for k, v in case.items() if k not in STATE_SKIP}
    supabase.table("hr_generated_letters").update({
        "field_values": state,
        "approval_status": case.get("status") or "active",
        "employee_id": case.get("employee_id"),
        "candidate_email": case.get("candidate_email") or None,
        "title": f"Onboarding: {case.get('candidate_name') or 'new joiner'}",
    }).eq("id", case["id"]).execute()
    return case


def log_event(case: dict, text: str) -> None:
    events = case.setdefault("events", [])
    events.append({"at": _now(), "text": text})
    del events[:-80]


def create_case(*, candidate_name: str, candidate_email: str, generated_by: str, designation: str = "",
                department: str = "", date_of_joining: str = "", location: str = "", mobile: str = "",
                offer_letter_id: str | None = None, offer_signed_at: str | None = None,
                reporting_manager_id: str | None = None, test_recipient: str = "") -> dict:
    state = {
        "candidate_name": candidate_name.strip(),
        "candidate_email": candidate_email.strip().lower(),
        "mobile": mobile.strip(),
        "designation": designation.strip(),
        "department": department.strip(),
        "location": location.strip(),
        "date_of_joining": parse_date(date_of_joining),
        "offer_letter_id": offer_letter_id,
        "offer_signed_at": offer_signed_at,
        "reporting_manager_id": reporting_manager_id,
        "is_analyst": bool(ANALYST_RE.search(designation or "")),
        "form_token": secrets.token_urlsafe(24),
        "biometric_token": secrets.token_urlsafe(24),
        "test_recipient": test_recipient.strip().lower(),
        "email_failures": [],
        "events": [],
    }
    inserted = supabase.table("hr_generated_letters").insert({
        "letter_type": CASE_TYPE,
        "title": f"Onboarding: {state['candidate_name']}",
        "rendered_body": "",
        "field_values": state,
        "generated_by": generated_by,
        "approval_status": "active",
        "candidate_email": state["candidate_email"] or None,
        "candidate_token": state["form_token"],
        "approver_token": state["biometric_token"],
    }).execute().data[0]
    case = _row_to_case(inserted)
    log_event(case, "Onboarding started" + (" from the signed offer letter" if offer_letter_id else ""))
    return case


# ── email ───────────────────────────────────────────────────────────────

def _mail(case: dict, to: str, subject: str, body: str, kind: str, html: str | None = None, cc: list[str] | None = None) -> bool:
    """Every pipeline email goes through here: a test case redirects all of
    its mail to test_recipient, and failures are recorded on the case so the
    escalation digest can surface them."""
    test_to = case.get("test_recipient")
    if test_to:
        body = f"[TEST — would have gone to {to or 'nobody'}{(' cc ' + ', '.join(cc)) if cc else ''}]\n\n" + body
        subject = "[TEST] " + subject
        to, cc = test_to, None
    if html is None:
        html = email_service._text_to_html(subject, body)
    ok, err = email_service.send_email_detailed(
        to, subject, body, kind=kind, html=html, cc=cc, reply_to=HR_CONTACT,
    )
    if not ok:
        case.setdefault("email_failures", []).append({"at": _now(), "kind": kind, "to": to, "error": err})
        del case["email_failures"][:-20]
        log_event(case, f"Email '{subject}' to {to or 'nobody'} FAILED ({err})")
    return ok


# ── step 2: NDA ─────────────────────────────────────────────────────────

def _nda_template_body() -> str:
    row = maybe_single_data(
        supabase.table("hr_letter_templates").select("body").eq("letter_type", NDA_TYPE).maybe_single().execute()
    )
    if row and (row.get("body") or "").strip():
        return row["body"]
    # Seed the template so HR can edit the wording on the Letters page.
    supabase.table("hr_letter_templates").upsert(
        {"letter_type": NDA_TYPE, "title": NDA_TITLE, "body": NDA_TEMPLATE, "updated_at": _now()}, on_conflict="letter_type",
    ).execute()
    return NDA_TEMPLATE


def _render(body: str, values: dict) -> str:
    from routers.letters import _substitute  # local import: routers import this module
    return _substitute(body, values)


def _stamp(label: str, who: str, extra: str) -> str:
    return (
        '<div class="lt-accept" style="margin-top:1.2em"><span class="lt-label">' + html_lib.escape(label) + "</span>"
        f'<p style="font-family:Georgia,serif;font-size:20px;font-style:italic;margin:4px 0">{html_lib.escape(who)}</p>'
        f'<p style="font-size:11.5px;color:#666;margin:0">{html_lib.escape(extra)}</p></div>'
    )


def send_nda(case: dict, generated_by: str) -> bool:
    s = get_settings()
    nda = None
    if case.get("nda_letter_id"):
        nda = maybe_single_data(supabase.table("hr_generated_letters").select("*").eq("id", case["nda_letter_id"]).maybe_single().execute())
    if not nda:
        values = {
            "letter_date": _today_label(), "company_name": "JADE Lifestyles India",
            "employee_name": case["candidate_name"], "designation": case.get("designation") or "a member of staff",
            "department_suffix": f", {case['department']}" if case.get("department") else "",
            "signatory_name": s["dev_name"], "signatory_title": s["dev_title"],
        }
        nda = supabase.table("hr_generated_letters").insert({
            "letter_type": NDA_TYPE, "title": NDA_TITLE, "rendered_body": _render(_nda_template_body(), values),
            "field_values": {**values, "onboarding_case_id": case["id"]}, "generated_by": generated_by,
            "employee_id": case.get("employee_id"), "approval_status": "awaiting_candidate",
            "candidate_email": case["candidate_email"], "candidate_token": secrets.token_urlsafe(24),
            "approver_email": s["dev_email"],
        }).execute().data[0]
        case["nda_letter_id"] = nda["id"]
    if nda.get("approval_status") != "awaiting_candidate":
        return True
    link = f"{APP_URL}/sign/{nda['candidate_token']}"
    ok = _mail(
        case, case["candidate_email"], "Please sign your JADE Non-Disclosure Agreement",
        f"Dear {_first(case['candidate_name'])},\n\n"
        "Thank you for accepting your offer from JADE Lifestyles India. The next step is our Non-Disclosure Agreement.\n\n"
        f"Please read it and sign it online here: {link}\n\n"
        "Once you sign, we will send you the new-joiner details form.\n\n"
        f"Questions? Reply to this email or write to {HR_CONTACT}.\n\nWarm regards,\nJADE HR",
        kind="onboarding_nda",
    )
    case["nda_sent_at"] = _now()
    log_event(case, f"NDA sent to {case['candidate_email']}" + ("" if ok else " (email failed)"))
    return ok


def notify_dev(case: dict, nda: dict) -> bool:
    s = get_settings()
    if not nda.get("approver_token"):
        nda["approver_token"] = secrets.token_urlsafe(24)
        supabase.table("hr_generated_letters").update({"approver_token": nda["approver_token"]}).eq("id", nda["id"]).execute()
    link = f"{APP_URL}/sign/{nda['approver_token']}"
    to = (nda.get("approver_email") or s["dev_email"]).strip()
    ok = _mail(
        case, to, f"Action needed: sign the NDA for {case['candidate_name']}",
        f"Hi {_first(s['dev_name'])},\n\n"
        f"{case['candidate_name']} ({case.get('designation') or 'new joiner'}) has signed the JADE Non-Disclosure Agreement. "
        "It now needs your signature on behalf of the company.\n\n"
        f"Review and sign here: {link}\n\nThanks,\nJADE HR",
        kind="onboarding_nda_countersign",
    )
    case["dev_notified_at"] = _now()
    log_event(case, f"{s['dev_name']} emailed to countersign the NDA" + ("" if ok else " (email failed)"))
    return ok


def nda_view(nda: dict, role: str) -> dict:
    status = nda.get("approval_status")
    can_act = (role == "candidate" and status == "awaiting_candidate") or (role == "approver" and status == "awaiting_countersign")
    return {
        "kind": "nda", "role": role, "status": status, "can_act": can_act, "title": nda.get("title") or NDA_TITLE,
        "candidate_name": (nda.get("field_values") or {}).get("employee_name", ""), "rendered_body": nda["rendered_body"],
        "signed_at": nda.get("candidate_signed_at"),
    }


def nda_sign(nda: dict, role: str, signature: str, confirm: bool) -> dict:
    signature = " ".join((signature or "").split())
    if len(signature) < 2 or not confirm:
        raise ValueError("Type your full name and tick the box to sign")
    case = get_case((nda.get("field_values") or {}).get("onboarding_case_id", ""))
    now = _now()
    status = nda.get("approval_status")
    if role == "candidate":
        if status != "awaiting_candidate":
            raise PermissionError("This NDA has already been signed.")
        stamped = nda["rendered_body"] + _stamp("Signed by the employee", signature, f"Signed electronically on {now[:10]}")
        nda = supabase.table("hr_generated_letters").update({
            "rendered_body": stamped, "candidate_signature": signature, "candidate_signed_at": now,
            "approval_status": "awaiting_countersign", "approver_token": secrets.token_urlsafe(24),
        }).eq("id", nda["id"]).execute().data[0]
        if case:
            case["nda_candidate_signed_at"] = now
            log_event(case, f"NDA signed by {signature}")
            notify_dev(case, nda)
            send_form_link(case)
            save_case(case)
        return {"ok": True, "status": "awaiting_countersign"}

    if status != "awaiting_countersign":
        raise PermissionError("This NDA is not waiting for a company signature.")
    stamped = nda["rendered_body"] + _stamp("Signed for the company", signature, f"Signed electronically on {now[:10]}")
    nda = supabase.table("hr_generated_letters").update({
        "rendered_body": stamped, "approver_initials": signature[:60], "approved_at": now, "approval_status": "accepted",
    }).eq("id", nda["id"]).execute().data[0]
    if case:
        case["nda_dev_signed_at"] = now
        log_event(case, f"NDA countersigned by {signature}")
        title = NDA_TITLE
        html_doc = build_letter_email_html(nda["rendered_body"], "Your signed Non-Disclosure Agreement with JADE Lifestyles India, for your records.", title)
        _mail(case, case["candidate_email"], "Your signed JADE Non-Disclosure Agreement",
              f"Dear {_first(case['candidate_name'])},\n\nYour Non-Disclosure Agreement with JADE Lifestyles India is now signed by both sides. "
              "The signed copy is included in this email for your records.\n\nWarm regards,\nJADE HR", kind="onboarding_nda_signed", html=html_doc)
        html_hr = build_letter_email_html(nda["rendered_body"], f"The NDA for {case['candidate_name']} is fully signed.", title)
        _mail(case, HR_CONTACT, f"Signed NDA: {case['candidate_name']}", f"The NDA for {case['candidate_name']} is signed by both sides.\n",
              kind="onboarding_nda_signed", html=html_hr)
        check_completion(case)
        save_case(case)
    return {"ok": True, "status": "accepted"}


# ── step 3: employee details form ───────────────────────────────────────

def send_form_link(case: dict) -> bool:
    link = f"{APP_URL}/onboarding/new?c={case['form_token']}"
    ok = _mail(
        case, case["candidate_email"], "Next step: your JADE new-joiner details form",
        f"Dear {_first(case['candidate_name'])},\n\n"
        "Thank you for signing the NDA. Please fill in the new-joiner details form, which takes about 10 minutes. "
        "Keep your Aadhar card, PAN card, bank details, a passport photo and your resume ready to upload.\n\n"
        f"Fill in the form here: {link}\n\n"
        f"Questions? Reply to this email or write to {HR_CONTACT}.\n\nWarm regards,\nJADE HR",
        kind="onboarding_form_link",
    )
    case["form_sent_at"] = _now()
    log_event(case, "Employee details form link sent" + ("" if ok else " (email failed)"))
    return ok


def prefill(case: dict) -> dict:
    return {k: case.get(k) or "" for k in ("candidate_name", "candidate_email", "mobile", "designation", "department", "date_of_joining", "location")}


def on_form_submitted(token: str, submission_id: str) -> None:
    case = case_by_form_token(token)
    if not case:
        return
    case["submission_id"] = submission_id
    case["form_submitted_at"] = _now()
    log_event(case, "Employee details form submitted, waiting for HR approval")
    save_case(case)


def on_form_approved(submission: dict, employee_id: str) -> None:
    case = case_by_field("submission_id", submission["id"])
    if not case:
        # Form filled without the emailed link: match the joiner by email.
        email = (submission.get("email") or "").strip().lower()
        if email:
            case = next((c for c in list_cases() if c["status"] == "active" and c.get("candidate_email") == email and not c.get("submission_id")), None)
        if not case:
            return
        case["submission_id"] = submission["id"]
        case["form_submitted_at"] = submission.get("submitted_at") or _now()
    case["employee_id"] = employee_id
    case["form_approved_at"] = _now()
    for key, sub_key in (("designation", "designation"), ("department", "department"), ("location", "place_of_work"), ("mobile", "mobile")):
        if submission.get(sub_key):
            case[key] = submission[sub_key]
    if submission.get("date_of_joining"):
        case["date_of_joining"] = parse_date(submission["date_of_joining"])
    case["is_analyst"] = case.get("is_analyst") or bool(ANALYST_RE.search(case.get("designation") or ""))
    if case.get("nda_letter_id"):
        supabase.table("hr_generated_letters").update({"employee_id": employee_id}).eq("id", case["nda_letter_id"]).execute()
    _apply_manager(case)
    log_event(case, "Form approved, employee record created")
    check_completion(case)
    save_case(case)


def _apply_manager(case: dict) -> None:
    """The app's reporting-manager link is hr_employees.leave_approver_id."""
    if not case.get("employee_id"):
        return
    emp = maybe_single_data(supabase.table("hr_employees").select("leave_approver_id").eq("id", case["employee_id"]).maybe_single().execute()) or {}
    if case.get("reporting_manager_id") and emp.get("leave_approver_id") != case["reporting_manager_id"]:
        supabase.table("hr_employees").update({"leave_approver_id": case["reporting_manager_id"]}).eq("id", case["employee_id"]).execute()
    elif not case.get("reporting_manager_id") and emp.get("leave_approver_id"):
        case["reporting_manager_id"] = emp["leave_approver_id"]


def set_manager(case: dict, manager_id: str | None) -> None:
    case["reporting_manager_id"] = manager_id or None
    _apply_manager(case)
    log_event(case, "Reporting manager updated")


# ── step 4: work email -> biometric, Slack, analyst doc ─────────────────

def _employee(employee_id: str | None) -> dict:
    if not employee_id:
        return {}
    return maybe_single_data(
        supabase.table("hr_employees").select("id,employee_code,first_name,last_name,email,phone,designation,department,location,date_of_joining")
        .eq("id", employee_id).maybe_single().execute()
    ) or {}


def set_work_email(case: dict, email: str) -> dict:
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        raise ValueError("Enter a valid email address")
    if not case.get("employee_id"):
        raise ValueError("Approve the joiner's details form first, so the employee record and code exist")
    clash = supabase.table("hr_employees").select("id").eq("email", email).neq("id", case["employee_id"]).execute().data
    if clash:
        raise ValueError("Another employee already has this email address")
    supabase.table("hr_employees").update({"email": email}).eq("id", case["employee_id"]).execute()
    case["work_email"] = email
    case["work_email_set_at"] = _now()
    log_event(case, f"Work email set to {email}")
    send_biometric_form(case)
    send_slack_invite(case)
    send_welcome(case)
    check_completion(case)
    return case


def send_biometric_form(case: dict) -> bool:
    s = get_settings()
    emp = _employee(case.get("employee_id"))
    link = f"{APP_URL}/biometric-form/{case['biometric_token']}"
    name = f"{emp.get('first_name', '')} {emp.get('last_name') or ''}".strip() or case["candidate_name"]
    lines = [
        f"Hi {_first(s['biometric_name'])},",
        "",
        f"{name} has joined and their work email is set up. Please enrol them on the biometric device.",
        "",
        "Biometric enrolment form",
        f"  Employee name: {name}",
        f"  Employee code (use this as the device user ID): {emp.get('employee_code', '')}",
        f"  Designation: {emp.get('designation') or case.get('designation', '')}",
        f"  Department: {emp.get('department') or case.get('department', '')}",
        f"  Location: {emp.get('location') or case.get('location', '')}",
        f"  Date of joining: {_fmt_date(emp.get('date_of_joining') or case.get('date_of_joining'))}",
        f"  Mobile: {emp.get('phone') or case.get('mobile', '')}",
        f"  Work email: {case.get('work_email', '')}",
    ]
    lines = [l for l in lines if not l.endswith(": ")] + [
        "",
        f"After enrolling, confirm it here (this closes the biometric step): {link}",
        "",
        "Thanks,\nJADE HR onboarding",
    ]
    ok = _mail(case, s["biometric_email"], f"Biometric enrolment: {name} ({emp.get('employee_code', '')})", "\n".join(lines), kind="onboarding_biometric")
    case["biometric_emailed_at"] = _now()
    log_event(case, f"Biometric enrolment form sent to {s['biometric_name']}" + ("" if ok else " (email failed)"))
    return ok


def biometric_view(case: dict) -> dict:
    emp = _employee(case.get("employee_id"))
    return {
        "employee_name": f"{emp.get('first_name', '')} {emp.get('last_name') or ''}".strip() or case.get("candidate_name"),
        "employee_code": emp.get("employee_code", ""), "designation": emp.get("designation") or case.get("designation", ""),
        "department": emp.get("department") or case.get("department", ""), "location": emp.get("location") or case.get("location", ""),
        "date_of_joining": emp.get("date_of_joining") or case.get("date_of_joining", ""), "mobile": emp.get("phone") or case.get("mobile", ""),
        "work_email": case.get("work_email", ""), "enrolled_at": case.get("biometric_enrolled_at"),
        "device_code": case.get("biometric_device_code", ""), "methods": case.get("biometric_methods", []),
    }


def biometric_confirm(case: dict, device_code: str, methods: list[str], enrolled_by: str, note: str) -> None:
    if case.get("biometric_enrolled_at"):
        raise PermissionError("Enrolment is already confirmed for this employee.")
    device_code = device_code.strip()
    methods = [m for m in methods if m in ("fingerprint", "face", "card")]
    if not device_code or not methods or len(enrolled_by.strip()) < 2:
        raise ValueError("Fill in the device user ID, at least one enrolment method and your name")
    case["biometric_device_code"] = device_code
    case["biometric_methods"] = methods
    case["biometric_by"] = enrolled_by.strip()
    case["biometric_note"] = note.strip()
    case["biometric_enrolled_at"] = _now()
    emp = _employee(case.get("employee_id"))
    mismatch = emp.get("employee_code") and device_code != emp["employee_code"]
    log_event(case, f"Biometric enrolment confirmed by {enrolled_by.strip()} (device ID {device_code}, {', '.join(methods)})"
              + (f" — DOES NOT MATCH employee code {emp['employee_code']}" if mismatch else ""))
    if mismatch:
        case["biometric_mismatch"] = True
    check_completion(case)


def _slack_api(token: str, method: str, params: dict) -> dict:
    req = urllib.request.Request(
        f"https://slack.com/api/{method}", data=urllib.parse.urlencode(params).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/x-www-form-urlencoded"}, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read() or b"{}")
    except (urllib.error.URLError, ValueError) as e:
        return {"ok": False, "error": f"request_failed:{e}"}


def send_slack_invite(case: dict) -> None:
    """Workspace invites through the API need Slack Enterprise Grid
    (admin.users.invite). Without that, the workspace's shared invite link
    goes out in the welcome email instead."""
    s = get_settings()
    email = case.get("work_email")
    case["slack_status"], case["slack_error"] = "not_configured", ""
    if s["slack_admin_token"] and s["slack_team_id"]:
        res = _slack_api(s["slack_admin_token"], "admin.users.invite", {
            "team_id": s["slack_team_id"], "email": email, "channel_ids": "", "real_name": case.get("candidate_name", ""),
        })
        if res.get("ok") or res.get("error") in ("already_in_team", "already_invited"):
            case["slack_status"] = "invited"
        else:
            case["slack_status"], case["slack_error"] = "failed", res.get("error", "unknown")
    if case["slack_status"] != "invited" and s["slack_invite_link"]:
        case["slack_status"] = "link_emailed"  # confirmed by send_welcome
    case["slack_at"] = _now()
    log_event(case, {
        "invited": f"Slack invite sent to {email}",
        "link_emailed": f"Slack join link included in the welcome email to {email}",
        "failed": f"Slack invite FAILED ({case['slack_error']})",
        "not_configured": "Slack invite NOT sent: no Slack invite link or admin token in the onboarding settings",
    }[case["slack_status"]])


def send_welcome(case: dict) -> bool:
    s = get_settings()
    emp = _employee(case.get("employee_id"))
    parts = [
        f"Dear {_first(case['candidate_name'])},",
        "",
        "Welcome to JADE! Your work email is ready. Here is everything you need to get started.",
        "",
        f"Employee code: {emp.get('employee_code', '')}",
        "HR console (leave, attendance, payslips): https://jade-hr.vercel.app/login",
    ]
    if case.get("slack_status") == "invited":
        parts.append("Slack: an invite has been sent to this address from Slack. Please accept it today.")
    elif s["slack_invite_link"]:
        parts.append(f"Slack: join the JADE workspace with this email address here: {s['slack_invite_link']}")
    send_doc = case.get("is_analyst") and s["analyst_doc_url"]
    if send_doc:
        parts += ["", f"As you are joining as an analyst, please read the {s['analyst_doc_name']} before your first week ends: {s['analyst_doc_url']}"]
    parts += ["", f"Questions? Write to {HR_CONTACT}.", "", "Warm regards,\nJADE HR"]
    ok = _mail(case, case["work_email"], "Welcome to JADE: your onboarding checklist", "\n".join(parts), kind="onboarding_welcome")
    if not ok and case.get("slack_status") == "link_emailed":
        case["slack_status"] = "failed"
        case["slack_error"] = "welcome email failed"
    if send_doc and ok:
        case["analyst_doc_sent_at"] = _now()
        log_event(case, f"{s['analyst_doc_name']} sent")
    elif case.get("is_analyst") and not s["analyst_doc_url"]:
        log_event(case, "Analyst onboarding document NOT sent: no document link in the onboarding settings")
    return ok


def resend_analyst_doc(case: dict) -> bool:
    s = get_settings()
    if not s["analyst_doc_url"]:
        raise ValueError("Add the analyst onboarding document link in Settings first")
    to = case.get("work_email") or case.get("candidate_email")
    ok = _mail(case, to, s["analyst_doc_name"],
               f"Dear {_first(case['candidate_name'])},\n\nPlease read the {s['analyst_doc_name']}: {s['analyst_doc_url']}\n\nWarm regards,\nJADE HR",
               kind="onboarding_analyst_doc")
    if ok:
        case["analyst_doc_sent_at"] = _now()
        log_event(case, f"{s['analyst_doc_name']} sent to {to}")
    return ok


# ── completion ──────────────────────────────────────────────────────────

def steps(case: dict) -> list[dict]:
    out = [
        ("offer", "Offer letter signed", bool(case.get("offer_signed_at"))),
        ("nda", "NDA signed by joiner", bool(case.get("nda_candidate_signed_at"))),
        ("nda_dev", "NDA signed by Dev", bool(case.get("nda_dev_signed_at"))),
        ("form", "Details form submitted", bool(case.get("form_submitted_at"))),
        ("approved", "Form approved by HR", bool(case.get("form_approved_at"))),
        ("email", "Work email set", bool(case.get("work_email"))),
        ("biometric", "Biometric enrolled", bool(case.get("biometric_enrolled_at"))),
        ("slack", "Slack invite", case.get("slack_status") in ("invited", "link_emailed")),
    ]
    if case.get("is_analyst"):
        out.append(("analyst_doc", "Analyst document sent", bool(case.get("analyst_doc_sent_at"))))
    out.append(("manager", "Manager notified", bool(case.get("manager_notified_at"))))
    return [{"key": k, "label": l, "done": d} for k, l, d in out]


def check_completion(case: dict) -> None:
    if case.get("status") != "active" and case.get("status"):
        return
    if all(st["done"] for st in steps(case) if st["key"] != "manager"):
        if not case.get("completed_at"):
            case["completed_at"] = _now()
            log_event(case, "All onboarding steps complete")
        notify_manager(case)
        if case.get("manager_notified_at"):
            case["status"] = "completed"


def notify_manager(case: dict) -> None:
    if case.get("manager_notified_at"):
        return
    mgr = _employee(case.get("reporting_manager_id"))
    if not mgr:
        log_event(case, "Onboarding complete but NO reporting manager is set, so nobody was notified")
        return
    emp = _employee(case.get("employee_id"))
    s = get_settings()
    dept = emp.get("department") or case.get("department")
    text = (
        f"{case['candidate_name']} ({emp.get('designation') or case.get('designation', '')}{', ' + dept if dept else ''}) "
        "has completed onboarding: offer and NDA signed, details form approved, biometric enrolled and Slack invite sent. "
        f"Employee code {emp.get('employee_code', '')}, work email {case.get('work_email', '')}, "
        f"joining {_fmt_date(emp.get('date_of_joining') or case.get('date_of_joining'))}."
    )
    channel = ""
    mgr_email = (mgr.get("email") or "").strip().lower()
    if s["slack_bot_token"] and mgr_email and not case.get("test_recipient"):
        look = _slack_api(s["slack_bot_token"], "users.lookupByEmail", {"email": mgr_email})
        if look.get("ok"):
            sent = _slack_api(s["slack_bot_token"], "chat.postMessage", {"channel": look["user"]["id"], "text": ":white_check_mark: Onboarding complete. " + text})
            if sent.get("ok"):
                channel = "slack"
            else:
                log_event(case, f"Slack message to the manager failed ({sent.get('error')})")
        else:
            log_event(case, f"Manager {mgr_email} not found on Slack ({look.get('error')})")
    elif not s["slack_bot_token"]:
        log_event(case, "Slack bot token not set, so the manager was emailed instead of messaged on Slack")
    mgr_name = _first(mgr.get("first_name", ""))
    emailed = _mail(case, mgr_email, f"Onboarding complete: {case['candidate_name']}", f"Hi {mgr_name},\n\nOnboarding is complete for your new team member.\n\n{text}\n\nJADE HR", kind="onboarding_complete_manager", cc=[HR_CONTACT])
    if channel or emailed:
        case["manager_notified_at"] = _now()
        case["manager_notify_channel"] = "slack+email" if channel and emailed else (channel or "email")
        log_event(case, f"Reporting manager {mgr.get('first_name', '')} notified ({case['manager_notify_channel']})")


# ── escalation to Gaurav ────────────────────────────────────────────────

def _age_days(iso: str | None) -> float:
    if not iso:
        return 0
    try:
        return (datetime.now(timezone.utc) - datetime.fromisoformat(iso)).total_seconds() / 86400
    except ValueError:
        return 0


def issues(case: dict, s: dict | None = None) -> list[str]:
    s = s or get_settings()
    if case.get("status") not in (None, "", "active"):
        return []
    n = s["escalate_after_days"]
    out = []
    today = (datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)).date().isoformat()
    if case.get("nda_sent_at") and not case.get("nda_candidate_signed_at") and _age_days(case["nda_sent_at"]) >= n:
        out.append(f"NDA sent {int(_age_days(case['nda_sent_at']))} days ago, joiner has not signed")
    if not case.get("nda_sent_at") and case.get("offer_signed_at"):
        out.append("NDA was never sent")
    if case.get("nda_candidate_signed_at") and not case.get("nda_dev_signed_at") and _age_days(case["nda_candidate_signed_at"]) >= n:
        out.append(f"NDA waiting {int(_age_days(case['nda_candidate_signed_at']))} days for {s['dev_name']}'s signature")
    if case.get("form_sent_at") and not case.get("form_submitted_at") and _age_days(case["form_sent_at"]) >= n:
        out.append(f"Details form sent {int(_age_days(case['form_sent_at']))} days ago, not filled")
    if case.get("form_submitted_at") and not case.get("form_approved_at") and _age_days(case["form_submitted_at"]) >= 1:
        out.append("Details form submitted but not approved by HR")
    doj = case.get("date_of_joining")
    if doj and doj < today and not case.get("work_email"):
        out.append(f"Joined {_fmt_date(doj)} but no work email is set")
    if doj and doj < today and not case.get("form_submitted_at"):
        out.append(f"Joined {_fmt_date(doj)} but the details form is not filled")
    if case.get("biometric_emailed_at") and not case.get("biometric_enrolled_at") and _age_days(case["biometric_emailed_at"]) >= n:
        out.append(f"Biometric enrolment not confirmed by {s['biometric_name']} after {int(_age_days(case['biometric_emailed_at']))} days")
    if case.get("biometric_mismatch"):
        out.append(f"Biometric device ID {case.get('biometric_device_code')} does not match the employee code")
    if case.get("work_email") and case.get("slack_status") not in ("invited", "link_emailed"):
        out.append(f"Slack invite not sent ({case.get('slack_error') or 'Slack is not configured'})")
    if case.get("work_email") and case.get("is_analyst") and not case.get("analyst_doc_sent_at"):
        out.append("Analyst onboarding document not sent" + ("" if s["analyst_doc_url"] else " (no document link in settings)"))
    if case.get("form_approved_at") and not case.get("reporting_manager_id"):
        out.append("No reporting manager set")
    if case.get("completed_at") and not case.get("manager_notified_at"):
        out.append("Onboarding complete but the reporting manager was not notified")
    recent_fail = [f for f in case.get("email_failures") or [] if _age_days(f["at"]) < 3]
    for f in recent_fail[-3:]:
        out.append(f"Email to {f['to'] or 'nobody'} failed ({f['kind']}: {f['error']})")
    return out


def escalate(dry_run: bool = False) -> dict:
    s = get_settings()
    flagged = []
    for case in list_cases():
        found = issues(case, s)
        if found:
            flagged.append((case, found))
    result = {"flagged": [{"name": c["candidate_name"], "issues": i} for c, i in flagged], "emailed": False, "to": ""}
    if not flagged or dry_run:
        return result
    to = s["escalation_email"] or email_service.HR_NOTIFY_EMAIL
    lines = [f"Hi {_first(s['escalation_name'])},", "", "These onboardings need you to step in:", ""]
    for case, found in flagged:
        lines.append(f"{case['candidate_name']} ({case.get('designation') or 'role not set'}, joining {_fmt_date(case.get('date_of_joining'))})")
        lines += [f"  - {i}" for i in found]
        lines.append("")
    if not s["escalation_email"]:
        lines.append(f"(Sent to {to} because no escalation email is set in the onboarding settings.)")
    lines.append(f"Open the onboarding pipeline: {APP_URL}/admin/onboarding/pipeline")
    ok, err = email_service.send_email_detailed(
        to, f"Onboarding: {len(flagged)} joiner{'s' if len(flagged) != 1 else ''} need attention", "\n".join(lines),
        kind="onboarding_escalation", cc=[HR_CONTACT], reply_to=HR_CONTACT,
    )
    now = _now()
    for case, _ in flagged:
        case["last_escalated_at"] = now
        save_case(case)
    result.update(emailed=ok, to=to, error=err)
    return result


def summary(case: dict) -> dict:
    out = dict(case)
    out["steps"] = steps(case)
    out["issues"] = issues(case)
    mgr = _employee(case.get("reporting_manager_id"))
    out["manager"] = {"id": mgr.get("id"), "name": f"{mgr.get('first_name', '')} {mgr.get('last_name') or ''}".strip(), "email": mgr.get("email")} if mgr else None
    return out


# ── entry from the offer flow ───────────────────────────────────────────

def start_from_offer(letter: dict) -> dict | None:
    if case_by_field("offer_letter_id", letter["id"]):
        return None
    fv = letter.get("field_values") or {}
    case = create_case(
        candidate_name=fv.get("employee_name") or "New joiner", candidate_email=letter.get("candidate_email") or fv.get("email", ""),
        generated_by=letter["generated_by"], designation=fv.get("designation") or fv.get("internship_role", ""),
        department=fv.get("department", ""), date_of_joining=fv.get("joining_date") or fv.get("commencement_date", ""),
        location=fv.get("work_location", ""), offer_letter_id=letter["id"], offer_signed_at=letter.get("candidate_signed_at") or _now(),
    )
    log_event(case, "Offer letter signed")
    send_nda(case, letter["generated_by"])
    save_case(case)
    return case
