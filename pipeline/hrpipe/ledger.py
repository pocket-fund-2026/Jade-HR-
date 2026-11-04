"""Append-only ledger of every attempt (SQLite, local to the VPS). This is the pipeline's memory: what ran, what was held and why."""
import os
import sqlite3
import time

from . import config

SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job TEXT NOT NULL, slot TEXT NOT NULL,
  started_at TEXT NOT NULL, finished_at TEXT, status TEXT NOT NULL,   -- ok | failed | timeout | held | skipped
  exit_code INTEGER, reason TEXT, tail TEXT, result TEXT   -- result: JSON of what the job reported (parsed from its output) + upstream context
);
CREATE INDEX IF NOT EXISTS idx_runs_job_slot ON runs(job, slot, id);
CREATE TABLE IF NOT EXISTS handoffs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, from_job TEXT NOT NULL, topic TEXT NOT NULL, slot TEXT, payload TEXT,
  created_at TEXT NOT NULL, dedupe TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_handoffs_topic ON handoffs(topic, id);
CREATE TABLE IF NOT EXISTS problems (key TEXT PRIMARY KEY, first_seen REAL NOT NULL, detail TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS alerts (key TEXT PRIMARY KEY, last_sent REAL NOT NULL, open INTEGER NOT NULL DEFAULT 1);
"""


def connect(path=None):
    path = path or config.LEDGER
    os.makedirs(os.path.dirname(path), exist_ok=True)
    db = sqlite3.connect(path, timeout=30)
    db.row_factory = sqlite3.Row
    db.executescript(SCHEMA)
    if 'result' not in [r[1] for r in db.execute('PRAGMA table_info(runs)')]:
        db.execute('ALTER TABLE runs ADD COLUMN result TEXT')   # ledger created before hand-offs existed
    return db


def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def record(db, job, slot, status, started_at=None, exit_code=None, reason=None, tail=None, at=None, result=None):
    db.execute("INSERT INTO runs (job, slot, started_at, finished_at, status, exit_code, reason, tail, result) VALUES (?,?,?,?,?,?,?,?,?)",
               (job, slot, started_at or at or now_iso(), at or now_iso(), status, exit_code, (reason or "")[:300] or None, (tail or "")[-600:] or None, result))
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


# --- hand-offs between jobs -------------------------------------------------------------------------
def emit(db, from_job, topic, slot, payload, at, dedupe):
    """Record that `from_job` finished a stage and what it found. Idempotent per dedupe key. Returns the new id or None."""
    import json
    cur = db.execute("INSERT OR IGNORE INTO handoffs (from_job, topic, slot, payload, created_at, dedupe) VALUES (?,?,?,?,?,?)",
                     (from_job, topic, slot, json.dumps(payload) if payload is not None else None, at, dedupe))
    db.commit()
    return cur.lastrowid if cur.rowcount else None


def latest_handoff(db, topic, since_iso):
    return db.execute("SELECT * FROM handoffs WHERE topic=? AND created_at>=? ORDER BY id DESC LIMIT 1", (topic, since_iso)).fetchone()


def unconsumed(db, topic, consumer, since_iso):
    """Hand-offs of `topic` that `consumer` has not yet acted on (a run recorded for slot 'h<id>' as ok/skipped = consumed)."""
    return db.execute("""SELECT h.* FROM handoffs h WHERE h.topic=? AND h.created_at>=? AND NOT EXISTS
                         (SELECT 1 FROM runs r WHERE r.job=? AND r.slot='h'||h.id AND r.status IN ('ok','skipped')) ORDER BY h.id""", (topic, since_iso, consumer)).fetchall()


def backfill_handoffs(db, jobs):
    """Create the hand-off for the latest successful run of each emitting job that has none yet (migration from before hand-offs existed)."""
    for name, job in jobs.items():
        if not job.get("emits") or job.get("emit_if"):
            continue
        r = db.execute("SELECT * FROM runs WHERE job=? AND status='ok' ORDER BY id DESC LIMIT 1", (name,)).fetchone()
        if r:
            emit(db, name, job["emits"], r["slot"], None, r["finished_at"], f"{job['emits']}:{name}:{r['slot']}")
