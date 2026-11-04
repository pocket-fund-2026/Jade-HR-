"""hr-pipeline tick [--dry-run] | status | baseline"""
import argparse
import json
import fcntl
import os
import sys

from . import alerts, config, gates, ledger
from .engine import Engine, latest_slot

import datetime as dt


def _engine(dry):
    db = ledger.connect()
    if not dry:
        ledger.backfill_handoffs(db, config.JOBS)   # hand-offs for runs that succeeded before hand-offs existed
    return Engine(db, gates.load_env(), gates.fetch_readiness, dry_run=dry)


def cmd_tick(args):
    os.makedirs(os.path.dirname(config.LOCK), exist_ok=True)
    lock = open(config.LOCK, "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print("another tick is still running; skipping")
        return 0
    eng = _engine(args.dry_run)
    acts = eng.tick()
    if args.dry_run:
        print(f"dry run: {len(acts)} action(s) planned; nothing executed, nothing recorded")
    return 0


def _log_shows_success(job, start):
    """True if the job's own log has its success marker timestamped at/after the slot start."""
    import re
    try:
        lines = open(job["log"], errors="replace").read().splitlines()[-4000:]
    except OSError:
        return False
    stamp = re.compile(r"^\[(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)\]")
    for l in reversed(lines):
        m = stamp.match(l)
        if m and re.search(job["success_re"], l):
            return dt.datetime.strptime(m.group(1), "%Y-%m-%d %H:%M:%S").replace(tzinfo=dt.timezone.utc) >= start
    return False


def cmd_baseline(args):
    """Cutover safety: mark every slot that has already started as 'skipped' so taking over from the old cron never re-sends today's digests."""
    db = ledger.connect()
    now = dt.datetime.now(dt.timezone.utc)
    n = 0
    for name, job in config.JOBS.items():
        ls = latest_slot(job, now)
        if ls and job["idempotent"] and job.get("success_re") and not _log_shows_success(job, ls[0]):
            alerts.log(f"baseline: {name} {ls[1]} has no success in its log, left pending so the pipeline completes it")
            continue  # safe to (re)run, and the old watchdog is gone: never mark a failed slot as handled
        if ls and not ledger.succeeded(db, name, ls[1]):
            ledger.record(db, name, ls[1], "skipped", reason="baseline at cutover (old cron owned this slot)")
            n += 1
    alerts.log(f"baseline: {n} slot(s) marked as already handled")
    return 0


def cmd_handoffs(args):
    db = ledger.connect()
    for r in db.execute("SELECT * FROM handoffs ORDER BY id DESC LIMIT ?", (args.n,)):
        used = [x["job"] for x in db.execute("SELECT DISTINCT job FROM runs WHERE slot='h'||? AND status IN ('ok','skipped')", (r["id"],))]
        print(f"{r['created_at']}  {r['from_job']:18} -> '{r['topic']}'  {r['payload'] or ''}  consumed by: {', '.join(used) or '-'}")
    return 0


def cmd_status(args):
    db = ledger.connect()
    now = dt.datetime.now(dt.timezone.utc)
    print(f"{'job':20} {'slot (UTC)':17} {'status':8} found / reason")
    for name, job in config.JOBS.items():
        ls = latest_slot(job, now)
        last = ledger.last_any(db, name, ls[1]) if ls else None
        flag = "" if job.get("enabled", True) else " (disabled)"
        found = (json.loads(last["result"]).get("found") if last and last["result"] else None) or ""
        print(f"{name:20} {ls[1] if ls else '-':17} {(last['status'] if last else 'pending'):8} {found or ((last['reason'] or '') if last else '')}{flag}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="hr-pipeline")
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("tick"); t.add_argument("--dry-run", action="store_true"); t.set_defaults(fn=cmd_tick)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    h = sub.add_parser("handoffs"); h.add_argument("-n", type=int, default=15); h.set_defaults(fn=cmd_handoffs)
    sub.add_parser("baseline").set_defaults(fn=cmd_baseline)
    a = ap.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
