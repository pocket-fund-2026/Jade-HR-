"""Alerts to HR/ops by email (Resend, same credentials file as the HA monitor) plus the pipeline log. Never prints secrets."""
import json
import time
import urllib.request

from . import config


def log(msg, path=None):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S', time.gmtime())}] {msg}"
    try:
        with open(path or config.PIPE_LOG, "a") as f:
            f.write(line + "\n")
    except OSError:
        pass
    print(line, flush=True)


def _env():
    env = {}
    try:
        for line in open(config.ALERT_ENV):
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k] = v.strip().strip("'\"")
    except OSError:
        pass
    return env


KABIR_JID = "917977522875@s.whatsapp.net"   # the one approved monitoring recipient (WhatsApp-only rule, 2026-11-10)
BRIDGE_URL = "http://localhost:3000/send"


def _whatsapp(text):
    """Tina's local bridge through wa_guard (pacing + allowlist). One message per call, never retried in a loop."""
    try:
        import sys
        sys.path.insert(0, "/root/tina-agent")
        import wa_guard  # noqa: F401  (installs the outbound guard)
        import requests
        r = requests.post(BRIDGE_URL, json={"chatId": KABIR_JID, "message": text}, timeout=30)
        return r.status_code == 200
    except Exception as e:  # bridge down / guard refused: fall back, never break the run
        log(f"whatsapp alert not delivered: {type(e).__name__} {str(e)[:100]}")
        return False


def _email(subject, text):
    env = _env()
    to = [x.strip() for x in env.get("ALERT_EMAIL", "").split(",") if x.strip()]
    if not to or not env.get("RESEND_API_KEY") or not env.get("ALERT_FROM"):
        log("alert email not configured (ALERT_EMAIL/ALERT_FROM/RESEND_API_KEY); logged only")
        return False
    body = json.dumps({"from": f"JADE HR Pipeline <{env['ALERT_FROM']}>", "to": to, "subject": subject, "text": text}).encode()
    req = urllib.request.Request("https://api.resend.com/emails", data=body, headers={
        "Authorization": "Bearer " + env["RESEND_API_KEY"], "Content-Type": "application/json", "User-Agent": "jade-hr-pipeline/1"})
    try:
        urllib.request.urlopen(req, timeout=20).read()
        return True
    except Exception as e:  # an alert failure must never break the run
        log(f"alert email failed: {type(e).__name__} {str(e)[:100]}")
        return False


def send(subject, text, dry_run=False):
    """Incident alerts only (the engine sends at most one per outage plus one recovery note).
    WhatsApp to Kabir first (the approved channel); email only if WhatsApp could not be delivered, so an outage is never silent."""
    log(f"{'DRY-RUN (not sent) ' if dry_run else ''}ALERT {subject} :: {text[:300]}")
    if dry_run:
        return False
    if _whatsapp(f"*{subject}*\n\n{text}"):
        log("alert delivered by WhatsApp")
        return True
    if _email(subject, text):
        log("alert delivered by email (WhatsApp unavailable)")
        return True
    log("ALERT NOT DELIVERED on any channel")
    return False
