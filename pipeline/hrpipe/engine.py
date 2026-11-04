"""Scheduler tick: decides, for every job, whether it is due, gated, waiting for backoff, finished, or in trouble, and acts.
Deterministic (no model in the loop): the same ledger + clock + readiness always produce the same decision."""
import datetime as dt
import json
import os

from . import alerts, config, gates, ledger, runner

UTC = dt.timezone.utc


def _slot_dt(date, hhmm):
    h, m = hhmm.split(":")
    return dt.datetime(date.year, date.month, date.day, int(h), int(m), tzinfo=UTC)


def _date_ok(job, d):
    if job.get("dow") and d.isoweekday() not in job["dow"]:
        return False
    if job.get("months") and d.month not in job["months"]:
        return False
    if job.get("dom") and d.day not in job["dom"]:
        return False
    return True


def latest_slot(job, now):
    """Most recent slot that has started (today or yesterday, so a 23:00 slot can run past midnight). Returns (start, key) or None."""
    best = None
    for d in (now.date() - dt.timedelta(days=1), now.date()):
        if not _date_ok(job, d):
            continue
        for hhmm in job["slots"]:
            s = _slot_dt(d, hhmm)
            if s <= now and (best is None or s > best):
                best = s
    return (best, best.strftime("%Y-%m-%dT%H:%M")) if best else None


def _iso(d):
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse(ts):
    return dt.datetime.strptime(ts, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)


class Engine:
    def __init__(self, db, env, readiness_fn, now_fn=None, dry_run=False, runner_fn=None, jobs=None):
        self.db, self.env, self.dry = db, env, dry_run
        self._readiness_fn, self._readiness, self._readiness_loaded = readiness_fn, None, False
        self.now_fn = now_fn or (lambda: dt.datetime.now(UTC))
        self.runner = runner_fn or runner.execute
        self.jobs = jobs if jobs is not None else config.JOBS
        self.actions = []
        self.problems = {}

    def readiness(self):
        if not self._readiness_loaded:
            self._readiness_loaded = True
            try:
                self._readiness = self._readiness_fn(self.env)
            except Exception as e:
                alerts.log(f"readiness fetch failed: {type(e).__name__} {str(e)[:100]}")
                self._readiness = None
        return self._readiness

    def _note(self, job, slot, what):
        self.actions.append((job, slot, what))
        alerts.log(f"{job} [{slot}] {what}")

    def _problem(self, key, text):
        """Register something that is wrong right now. Nothing is emailed here: tick() decides once, after all checks."""
        self.problems[key] = text

    def tick(self):
        now = self.now_fn()
        self.problems = {}   # rebuilt from scratch every tick: a problem exists only while it is observed
        for name, job in self.jobs.items():
            if job.get("enabled", True):
                self._job(name, job, now)
        self._feed_health()
        self._incident(now)
        self._write_status(now)
        return self.actions

    def _incident(self, now):
        """At most ONE email per outage: sent when any problem has lasted >= DOWN_ALERT_AFTER_MIN; further problems join the open
        incident silently; the incident closes (silently) when everything is healthy again."""
        if self.dry:
            return
        seen = ledger.sync_problems(self.db, self.problems, now.timestamp())
        if not seen:
            if ledger.incident_open(self.db):
                ledger.incident_set(self.db, False)
                alerts.log("incident closed: everything healthy")
            return
        old = [(k, fs, d) for k, (fs, d) in seen.items() if now.timestamp() - fs >= config.DOWN_ALERT_AFTER_MIN * 60]
        if not old or ledger.incident_open(self.db):
            return
        lines = [f"- {d} (since {dt.datetime.fromtimestamp(fs, UTC):%H:%M} UTC, {int((now.timestamp() - fs) // 60)} min)" for k, fs, d in sorted(old, key=lambda x: x[1])]
        body = ("Something in the JADE HR automation has been down for more than %d minutes:\n\n%s\n\n"
                "Held jobs run by themselves once the data is fresh again; nothing has been sent or changed while they wait.\n"
                "You will not get another email for this outage. Check: hr-pipeline status  |  /var/log/jade-hr-pipeline.log") % (config.DOWN_ALERT_AFTER_MIN, "\n".join(lines))
        alerts.send(f"JADE HR down for {config.DOWN_ALERT_AFTER_MIN}+ min: {len(old)} issue{'s' if len(old) != 1 else ''}", body)
        ledger.incident_set(self.db, True)

    def _job(self, name, job, now):
        ls = latest_slot(job, now)
        if not ls:
            return
        start, slot = ls
        age_min = (now - start).total_seconds() / 60
        if ledger.succeeded(self.db, name, slot):
            return
        if age_min >= job["window_min"]:
            if job.get("alert_missed", True) and age_min < 24 * 60:
                self._problem(f"missed:{name}", f"{name} (slot {slot} UTC) did not complete within its {job['window_min']} minute window")
            return
        n = ledger.attempts(self.db, name, slot)
        last = ledger.last_real_attempt(self.db, name, slot)
        if last is not None and last["status"] in ("failed", "timeout") and job.get("alert_missed", True):
            self._problem(f"failing:{name}", f"{name} is failing (slot {slot} UTC, {n} attempt(s)): {(last['tail'] or '')[-120:].strip()}")
        if n >= job["max_attempts"]:
            return
        if last is not None and last["status"] == "timeout" and not job["idempotent"]:
            self._problem(f"human:{name}", f"{name} timed out and sends email / applies changes, so it is NOT retried automatically (it may already have acted); needs a person to check the log")
            return
        if last is not None and last["status"] in ("failed", "timeout") and (now - _parse(last["finished_at"])).total_seconds() < job["retry_min"] * 60:
            return  # backoff
        ok, why = gates.evaluate(self.readiness(), job.get("gate"))
        if not ok:
            prev = ledger.last_any(self.db, name, slot)
            if not self.dry and (prev is None or prev["status"] != "held" or prev["reason"] != why):
                ledger.record(self.db, name, slot, "held", reason=why, at=_iso(now))
            self._note(name, slot, f"HELD: {why}")
            self._problem(f"held:{name}", f"{name} is on hold: {why}")
            return
        if self.dry:
            self._note(name, slot, "WOULD RUN " + " ".join(os.path.basename(c) for c in job["cmd"][1:]))
            return
        started = _iso(now)
        if job.get("preview"):
            st, rc, tail = self.runner(job["preview"], self.env, job["timeout_s"], job.get("success_re"), job["log"])
            if st != "ok":
                ledger.record(self.db, name, slot, "failed", started, rc, "preview failed - real run not attempted", tail, at=_iso(now))
                self._note(name, slot, "preview failed; nothing applied")
                return
        st, rc, tail = self.runner(job["cmd"], self.env, job["timeout_s"], job.get("success_re"), job["log"])
        ledger.record(self.db, name, slot, st, started, rc, None if st == "ok" else "see tail", tail, at=_iso(now))
        self._note(name, slot, st.upper())

    def _feed_health(self):
        r = self.readiness()
        if r is None:
            self._problem("console", "the HR console API is unreachable (or the pipeline login failed), so data freshness cannot be checked")
            return
        for f in r.get("feeds", []):
            if f.get("severity") != "ok":
                self._problem(f"feed:{f.get('feed')}", f"data feed '{f.get('feed')}' is {f.get('status')} ({f.get('age_hours')}h since last update)")

    def _write_status(self, now):
        if self.dry:
            return
        rows = {}
        for name, job in self.jobs.items():
            ls = latest_slot(job, now)
            last = ledger.last_any(self.db, name, ls[1]) if ls else None
            rows[name] = {"enabled": job.get("enabled", True), "slot": ls[1] if ls else None, "last_status": last["status"] if last else None,
                          "last_at": last["finished_at"] if last else None, "reason": last["reason"] if last else None}
        try:
            os.makedirs(config.STATE_DIR, exist_ok=True)
            with open(f"{config.STATE_DIR}/status.json", "w") as f:
                json.dump({"generated_at": ledger.now_iso(), "jobs": rows}, f, indent=1)
        except OSError:
            pass
