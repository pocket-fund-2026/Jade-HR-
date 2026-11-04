"""hr-pipeline tick [--dry-run] | status | baseline"""
import argparse
import fcntl
import os
import sys

from . import alerts, config, gates, ledger
from .engine import Engine, latest_slot

import datetime as dt


def _engine(dry):
    return Engine(ledger.connect(), gates.load_env(), gates.fetch_readiness, dry_run=dry)


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


def cmd_baseline(args):
    """Cutover safety: mark every slot that has already started as 'skipped' so taking over from the old cron never re-sends today's digests."""
    db = ledger.connect()
    now = dt.datetime.now(dt.timezone.utc)
    n = 0
    for name, job in config.JOBS.items():
        ls = latest_slot(job, now)
        if ls and not ledger.succeeded(db, name, ls[1]):
            ledger.record(db, name, ls[1], "skipped", reason="baseline at cutover (old cron owned this slot)")
            n += 1
    alerts.log(f"baseline: {n} slot(s) marked as already handled")
    return 0


def cmd_status(args):
    db = ledger.connect()
    now = dt.datetime.now(dt.timezone.utc)
    print(f"{'job':20} {'slot (UTC)':17} {'status':8} reason")
    for name, job in config.JOBS.items():
        ls = latest_slot(job, now)
        last = ledger.last_any(db, name, ls[1]) if ls else None
        flag = "" if job.get("enabled", True) else " (disabled)"
        print(f"{name:20} {ls[1] if ls else '-':17} {(last['status'] if last else 'pending'):8} {(last['reason'] or '') if last else ''}{flag}")
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(prog="hr-pipeline")
    sub = ap.add_subparsers(dest="cmd", required=True)
    t = sub.add_parser("tick"); t.add_argument("--dry-run", action="store_true"); t.set_defaults(fn=cmd_tick)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    sub.add_parser("baseline").set_defaults(fn=cmd_baseline)
    a = ap.parse_args(argv)
    return a.fn(a)


if __name__ == "__main__":
    sys.exit(main())
