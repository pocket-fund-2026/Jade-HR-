"""Append-only ledger of every attempt (SQLite, local to the VPS). This is the pipeline's memory: what ran, what was held and why."""
import os
import sqlite3
import time

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL, slot TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL,   -- ok | failed | timeout | held | skipped
  exit_code INTEGER, reason TEXT, tail TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_job_slot ON runs(job, slot, id);
CREATE TABLE IF NOT EXISTS problems (key TEXT PRIMARY KEY, first_seen REAL NOT NULL, detail TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (key TEXT PRIMARY KEY, last_sent REAL NOT NULL, open INTEGER NOT NULL DEFAULT 1);
"""


def connect(path=None):
    path = path or config.LEDGER
    os.makedirs(os.path.dirname(path), exist_ok=True)
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    return db


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def record(db, job, slot, status, started_at=None, exit_code=None, reason=None, tail=None, at=None):
    db.execute("INSERT INTO runs (job, slot, started_at, finished_at, status, exit_code, reason, tail) VALUES (?,?,?,?,?,?,?,?)",
               (job, slot, started_at or at or now_iso(), at or now_iso(), status, exit_code, (reason or "")[:300] or None, (tail or "")[-600:] or None))
    db.commit()


def succeeded(db, job, slot):
    return db.execute("SELECT 1 FROM runs WHERE job=? AND slot=? AND status IN ('ok','skipped') LIMIT 1", (job, slot)).fetchone() is not None


def attempts(db, job, slot):
    """Real attempts (ok/failed/timeout). Holds do not count: waiting for a gate must not burn the retry budget."""
    return db.execute("SELECT COUNT(*) n FROM runs WHERE job=? AND slot=? AND status IN ('ok','failed','timeout')", (job, slot)).fetchone()["n"]


def last_real_attempt(db, job, slot):
    return db.execute("SELECT * FROM runs WHERE job=? AND slot=? AND status IN ('ok','failed','timeout') ORDER BY id DESC LIMIT 1", (job, slot)).fetchone()


def last_any(db, job, slot):
    return db.execute("SELECT * FROM runs WHERE job=? AND slot=? ORDER BY id DESC LIMIT 1", (job, slot)).fetchone()


# --- single-incident alerting: at most ONE email per outage ---------------------------------------
def sync_problems(db, current, ts):
    """current: {key: detail} seen this tick. Keeps first_seen for ongoing problems, drops resolved ones. Returns {key: (first_seen, detail)}."""
    old = {r["key"]: r["first_seen"] for r in db.execute("SELECT key, first_seen FROM problems")}
    for k in set(old) - set(current):
        db.execute("DELETE FROM problems WHERE key=?", (k,))
    for k, d in current.items():
        db.execute("INSERT INTO problems (key, first_seen, detail) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET detail=excluded.detail", (k, old.get(k, ts), d))
    db.commit()
    return {k: (old.get(k, ts), d) for k, d in current.items()}


def incident_open(db):
    r = db.execute("SELECT open FROM alerts WHERE key='incident'").fetchone()
    return bool(r and r["open"])


def incident_set(db, is_open):
    db.execute("INSERT INTO alerts (key,last_sent,open) VALUES ('incident',?,?) ON CONFLICT(key) DO UPDATE SET last_sent=excluded.last_sent, open=excluded.open", (time.time(), 1 if is_open else 0))
    db.commit()
