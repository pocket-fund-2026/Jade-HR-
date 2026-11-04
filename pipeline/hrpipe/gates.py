"""Verification gates. A gate answers: is the data this job acts on fit to trust right now? It reuses the console's own
/api/data-readiness (feeds + checks), so there is one definition of "ready", not two. Read-only: it never writes."""
import json
import urllib.request

from . import config


def load_env(files=None):
    env = {}
    for f in files or config.ENV_FILES:
        try:
            for line in open(f):
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if line.startswith("export "):
                    line = line[7:]
                if "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip("'\"")
        except OSError:
            pass
    return env


def _call(path, data=None, token=None, timeout=60):
    h = {"Content-Type": "application/json", "User-Agent": "jade-hr-pipeline/1"}
    if token:
        h["Authorization"] = "Bearer " + token
    req = urllib.request.Request(config.JADE_HR_URL + path, data=data, headers=h)
    return json.loads(urllib.request.urlopen(req, timeout=timeout).read())


def fetch_readiness(env):
    tok = _call("/api/auth/login", json.dumps({"employee_code": env.get("JADE_HR_USER", ""), "password": env.get("JADE_HR_PASS", "")}).encode())
    token = tok.get("access_token") or tok.get("token")
    return _call("/api/data-readiness", token=token)


def evaluate(readiness, gate):
    """Pure function: (readiness payload, gate name) -> (ok, reason). Unit-tested without network."""
    if gate is None:
        return True, ""
    if readiness is None:
        return False, "readiness check unavailable (console API unreachable or login failed)"
    feeds = {f.get("feed") or f.get("name") or "": f for f in readiness.get("feeds", [])}
    bio = next((f for k, f in feeds.items() if "iometric" in k), None)
    roster = next((f for k, f in feeds.items() if "oster" in k), None)
    if readiness.get("decision") == "not_ready":
        return False, "data readiness is 'not_ready'"
    if gate in ("attendance", "attendance_roster"):
        if bio is None:
            return False, "biometric feed status missing from readiness check"
        if bio.get("severity") != "ok":
            return False, f"biometric feed is {bio.get('status', 'stale')} (age {bio.get('age_hours')}h)"
    if gate == "attendance_roster":
        if roster is None:
            return False, "roster feed status missing from readiness check"
        if roster.get("severity") != "ok":
            return False, f"roster feed is {roster.get('status', 'stale')} (age {roster.get('age_hours')}h)"
    return True, ""
