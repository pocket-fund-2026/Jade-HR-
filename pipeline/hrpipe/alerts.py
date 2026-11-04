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


def send(subject, text, dry_run=False):
    log(f"{'DRY-RUN (not sent) ' if dry_run else ''}ALERT {subject} :: {text[:300]}")
    if dry_run:
        return False
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
