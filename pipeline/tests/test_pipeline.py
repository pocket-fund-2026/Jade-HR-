import datetime as dt
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from hrpipe import alerts, config, engine, gates, ledger  # noqa: E402

# SAFETY: tests must never send real email or write the real log. Stub the only two outward-facing functions for the whole module.
SENT = []
alerts.send = lambda subject, text, dry_run=False: SENT.append(subject) or False
config.PIPE_LOG = os.path.join(tempfile.mkdtemp(), 'pipeline.log')
config.STATE_DIR = tempfile.mkdtemp()
alerts.log = lambda msg, path=None: None

UTC = dt.timezone.utc
READY = {"decision": "ready_with_controls", "feeds": [
    {"feed": "Biometric punches", "severity": "ok", "status": "fresh", "age_hours": 1},
    {"feed": "Employee roster sync", "severity": "ok", "status": "fresh", "age_hours": 5}]}


def feeds(bio="ok", roster="ok", decision="ready"):
    return {"decision": decision, "feeds": [
        {"feed": "Biometric punches", "severity": bio, "status": "stale" if bio != "ok" else "fresh", "age_hours": 9},
        {"feed": "Employee roster sync", "severity": roster, "status": "stale" if roster != "ok" else "fresh", "age_hours": 40}]}


def job(**kw):
    d = dict(cmd=["python3", "x.py"], slots=["06:15"], window_min=360, gate="attendance", idempotent=False, max_attempts=3,
             timeout_s=10, retry_min=5, success_re=None, log="/dev/null", alert_missed=False)
    d.update(kw)
    return d


class Fake:
    def __init__(self, results):
        self.results, self.calls = list(results), []

    def __call__(self, cmd, env, timeout_s, success_re, log):
        self.calls.append(cmd)
        return self.results.pop(0)


def make(jobs, readiness, now, runner):
    db = ledger.connect(os.path.join(tempfile.mkdtemp(), "l.db"))
    return db, engine.Engine(db, {}, lambda e: readiness, now_fn=lambda: now, runner_fn=runner, jobs=jobs)


class Gates(unittest.TestCase):
    def test_ready(self):
        self.assertTrue(gates.evaluate(feeds(), "attendance")[0])
    def test_stale_biometric_blocks(self):
        self.assertFalse(gates.evaluate(feeds(bio="block"), "attendance")[0])
    def test_roster_only_matters_for_roster_gate(self):
        self.assertTrue(gates.evaluate(feeds(roster="block"), "attendance")[0])
        self.assertFalse(gates.evaluate(feeds(roster="block"), "attendance_roster")[0])
    def test_not_ready_blocks_everything_gated(self):
        self.assertFalse(gates.evaluate(feeds(decision="not_ready"), "attendance")[0])
    def test_no_gate_always_ok(self):
        self.assertTrue(gates.evaluate(None, None)[0])
    def test_unavailable_readiness_holds(self):
        self.assertFalse(gates.evaluate(None, "attendance")[0])


class Engine(unittest.TestCase):
    def setUp(self):
        SENT.clear()

    NOW = dt.datetime(2026, 11, 4, 6, 20, tzinfo=UTC)

    def test_runs_when_gate_open_and_records_once(self):
        r = Fake([("ok", 0, "done")])
        db, e = make({"late": job()}, feeds(), self.NOW, r)
        e.tick(); e.tick()
        self.assertEqual(len(r.calls), 1)  # second tick: already succeeded

    def test_held_when_stale_and_never_runs(self):
        r = Fake([])
        db, e = make({"late": job()}, feeds(bio="block"), self.NOW, r)
        e.tick()
        self.assertEqual(r.calls, [])
        self.assertEqual(ledger.last_any(db, "late", "2026-11-04T06:15")["status"], "held")
        self.assertEqual(ledger.attempts(db, "late", "2026-11-04T06:15"), 0)  # holds don't burn retries

    def test_runs_after_gate_clears(self):
        r = Fake([("ok", 0, "")])
        db, e = make({"late": job()}, feeds(bio="block"), self.NOW, r)
        e.tick()
        e._readiness = feeds(); e._readiness_loaded = True
        e.tick()
        self.assertEqual(len(r.calls), 1)

    def test_backoff_after_failure(self):
        r = Fake([("failed", 1, "boom"), ("ok", 0, "")])
        db, e = make({"late": job()}, feeds(), self.NOW, r)
        e.tick(); e.tick()
        self.assertEqual(len(r.calls), 1)  # inside retry_min -> waits
        e.now_fn = lambda: self.NOW + dt.timedelta(minutes=6)
        e.tick()
        self.assertEqual(len(r.calls), 2)

    def test_email_job_not_retried_after_timeout(self):
        r = Fake([("timeout", None, "")])
        db, e = make({"late": job()}, feeds(), self.NOW, r)
        e.dry = False
        e.tick()
        e.now_fn = lambda: self.NOW + dt.timedelta(minutes=30)
        e.tick()
        self.assertEqual(len(r.calls), 1)

    def test_idempotent_job_retried_after_timeout(self):
        r = Fake([("timeout", None, ""), ("ok", 0, "")])
        db, e = make({"sync": job(idempotent=True, gate=None)}, feeds(), self.NOW, r)
        e.tick(); e.now_fn = lambda: self.NOW + dt.timedelta(minutes=6); e.tick()
        self.assertEqual(len(r.calls), 2)

    def test_max_attempts_stops(self):
        r = Fake([("failed", 1, "x")] * 5)
        db, e = make({"late": job(max_attempts=2, retry_min=0)}, feeds(), self.NOW, r)
        for i in range(5):
            e.now_fn = lambda i=i: self.NOW + dt.timedelta(minutes=i)
            e.tick()
        self.assertEqual(len(r.calls), 2)

    def test_preview_failure_blocks_apply(self):
        r = Fake([("failed", 1, "preview boom")])
        db, e = make({"qrc": job(preview=["p", "--dry-run"])}, feeds(), self.NOW, r)
        e.tick()
        self.assertEqual(len(r.calls), 1)  # only the preview ran
        self.assertEqual(ledger.last_any(db, "qrc", "2026-11-04T06:15")["status"], "failed")

    def test_preview_then_apply(self):
        r = Fake([("ok", 0, "preview"), ("ok", 0, "applied")])
        db, e = make({"qrc": job(preview=["p"])}, feeds(), self.NOW, r)
        e.tick()
        self.assertEqual(len(r.calls), 2)

    def test_dry_run_changes_nothing(self):
        r = Fake([])
        db, e = make({"late": job()}, feeds(), self.NOW, r)
        e.dry = True
        e.tick()
        self.assertEqual(r.calls, [])
        self.assertIsNone(ledger.last_any(db, "late", "2026-11-04T06:15"))

    def test_disabled_job_never_runs(self):
        r = Fake([])
        db, e = make({"hold": job(enabled=False)}, feeds(), self.NOW, r)
        e.tick()
        self.assertEqual(r.calls, [])

    def test_calendar_restriction_quarter_job(self):
        j = job(months={3, 6, 9, 12}, dom={23}, slots=["09:00"])
        self.assertIsNone(engine.latest_slot(j, dt.datetime(2026, 11, 23, 10, tzinfo=UTC)))
        self.assertIsNone(engine.latest_slot(j, dt.datetime(2026, 12, 22, 10, tzinfo=UTC)))
        self.assertIsNotNone(engine.latest_slot(j, dt.datetime(2026, 12, 23, 10, tzinfo=UTC)))

    def test_slot_crosses_midnight(self):
        j = job(slots=["23:00"], window_min=180)
        s = engine.latest_slot(j, dt.datetime(2026, 11, 5, 0, 30, tzinfo=UTC))
        self.assertEqual(s[1], "2026-11-04T23:00")

    def test_baseline_skipped_slot_counts_as_done(self):
        r = Fake([])
        db, e = make({"late": job()}, feeds(), self.NOW, r)
        ledger.record(db, "late", "2026-11-04T06:15", "skipped", reason="baseline")
        e.tick()
        self.assertEqual(r.calls, [])

    def test_later_slot_supersedes_earlier(self):
        j = job(slots=["04:00", "05:00"], gate=None, idempotent=True)
        s = engine.latest_slot(j, dt.datetime(2026, 11, 4, 5, 10, tzinfo=UTC))
        self.assertEqual(s[1], "2026-11-04T05:00")


class OneEmailPolicy(unittest.TestCase):
    """The user's rule: ONE email, only once something has been down 15+ minutes, no spam."""
    T0 = dt.datetime(2026, 11, 4, 6, 20, tzinfo=UTC)

    def setUp(self):
        SENT.clear()

    def run_at(self, e, minutes):
        e.now_fn = lambda: self.T0 + dt.timedelta(minutes=minutes)
        e._readiness_loaded = False   # re-fetch each tick like production
        e.tick()

    def test_no_email_before_15_minutes(self):
        db, e = make({"late": job()}, feeds(bio="block"), self.T0, Fake([]))
        self.run_at(e, 0); self.run_at(e, 14)
        self.assertEqual(SENT, [])

    def test_exactly_one_email_after_15_minutes_even_over_hours(self):
        db, e = make({"late": job()}, feeds(bio="block"), self.T0, Fake([]))
        for m in (0, 10, 16, 30, 60, 120, 240):
            self.run_at(e, m)
        self.assertEqual(len(SENT), 1)

    def test_new_problem_joins_open_incident_silently(self):
        db, e = make({"late": job(), "clocks": job(slots=["06:30"])}, feeds(bio="block"), self.T0, Fake([]))
        for m in (0, 16, 40):
            self.run_at(e, m)
        self.assertEqual(len(SENT), 1)

    def test_recovery_sends_nothing_then_new_outage_emails_again(self):
        r = Fake([("ok", 0, "")])
        db, e = make({"late": job()}, feeds(bio="block"), self.T0, r)
        self.run_at(e, 0); self.run_at(e, 16)
        self.assertEqual(len(SENT), 1)
        e._readiness_fn = lambda env: feeds(); self.run_at(e, 20)          # recovers, job runs OK
        self.assertEqual(len(SENT), 1)                      # no "recovered" mail
        self.assertFalse(ledger.incident_open(db))
        e._readiness_fn = lambda env: feeds(bio="block")
        e.jobs = {"later": job(slots=["07:00"])}
        self.run_at(e, 45); self.run_at(e, 70)
        self.assertEqual(len(SENT), 2)                      # a genuinely new outage

    def test_success_and_quarter_apply_send_no_email(self):
        r = Fake([("ok", 0, "p"), ("ok", 0, "a")])
        db, e = make({"qrc": job(preview=["p"])}, feeds(), self.T0, r)
        self.run_at(e, 0)
        self.assertEqual(SENT, [])

    def test_unreachable_console_counts_as_down(self):
        db, e = make({"late": job()}, None, self.T0, Fake([]))
        self.run_at(e, 0); self.run_at(e, 16)
        self.assertEqual(len(SENT), 1)

    def test_flaky_attendance_sync_alone_does_not_email(self):
        j = job(idempotent=True, gate=None, alert_missed=False, retry_min=0, max_attempts=36)
        r = Fake([("failed", 1, "SmartOffice unreachable")] * 40)
        db, e = make({"sync": j}, feeds(), self.T0, r)
        for m in range(0, 120, 5):
            self.run_at(e, m)
        self.assertEqual(SENT, [])                          # freshness is judged by the feed, not each failed run

    def test_dry_run_never_emails_or_records_problems(self):
        db, e = make({"late": job()}, feeds(bio="block"), self.T0, Fake([]))
        e.dry = True
        self.run_at(e, 0); self.run_at(e, 30)
        self.assertEqual(SENT, [])
        self.assertEqual(db.execute("select count(*) from problems").fetchone()[0], 0)


class OrgSnapshot(unittest.TestCase):
    def raw(self):
        e = lambda i, n, d, dept, m, top=False, act=True: {"employee_id": i, "employee_code": f"E{i}", "name": n, "designation": d, "department": dept, "location": "Mumbai",
                                                            "reporting_manager_id": m, "reporting_manager": "", "top_of_org": top, "status": "Active", "active_view": act}
        return {"as_of": "2026-11-04", "employees": [e(1, "Dir", "Director", "Corporate", None, True), e(2, "Head M", "Head of Marketing", "Marketing", 1), e(3, "Exec M", "Executive", "Marketing", 2),
                                                      e(4, "Exec M2", "Executive", "Marketing", 2), e(5, "Solo", "Operator", "CAD", 1), e(6, "Gone", "Old", "Marketing", 2, act=False)]}

    def test_reports_chain_and_exclusion(self):
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
        import org_snapshot
        o = org_snapshot.build(self.raw())
        P = {p["id"]: p for p in o["people"]}
        self.assertEqual(o["headcount"], 5)                      # inactive person excluded
        self.assertEqual(sorted(P[2]["reports"]), [3, 4])
        self.assertEqual(P[3]["chain"], [2, 1])                  # manager, then manager's manager
        self.assertEqual(o["department_heads"]["Marketing"], {"id": 2, "confident": True})
        self.assertFalse(o["department_heads"]["CAD"]["confident"])  # no leader title, no reports: not presented as fact

    def test_no_sensitive_fields_leak(self):
        import org_snapshot
        keys = set(org_snapshot.build(self.raw())["people"][0])
        self.assertFalse(keys & {"date_of_joining", "confirmation_date", "resignation_date", "leaving_date", "salary", "basic"})


class HandOffs(unittest.TestCase):
    """Jobs are connected: results travel, downstream jobs wait for / react to upstream hand-offs."""
    T0 = dt.datetime(2026, 11, 4, 6, 20, tzinfo=UTC)

    def setUp(self):
        SENT.clear()

    def two(self, rs, **kw):
        sync = job(gate=None, idempotent=True, slots=["06:00"], emits="attendance_synced", success_re=None,
                   parse=[r"inserted=(?P<inserted>\d+)\s+skipped=(?P<skipped>\d+)"])
        digest = job(gate=None, slots=["06:15"], after={"topic": "attendance_synced", "within_min": 120}, parse=[r"(?P<late>\d+) late on"])
        f = Fake(rs)
        db, e = make({"sync": {**sync, **kw}, "digest": digest}, feeds(), self.T0, f)
        return db, e, f

    def test_digest_waits_when_sync_failed_then_runs_in_same_tick_once_sync_lands(self):
        db, e, f = self.two([("failed", 1, "boom"), ("ok", 0, "Done inserted=5 skipped=497"), ("ok", 0, "6 late on 2026-11-04")])
        e.tick()                                      # sync fails -> digest must NOT run on stale data
        self.assertEqual(len(f.calls), 1)
        self.assertEqual(db.execute("select status from runs where job='digest'").fetchone()[0], "held")
        e.now_fn = lambda: self.T0 + dt.timedelta(minutes=6); e._readiness_loaded = False
        e.tick()                                      # sync retried OK -> hand-off -> digest runs right after, same tick
        self.assertEqual(len(f.calls), 3)
        self.assertEqual(ledger.succeeded(db, "digest", "2026-11-04T06:15"), True)

    def test_results_are_parsed_recorded_and_passed_downstream(self):
        import json
        db, e, f = self.two([("ok", 0, "Done inserted=5 skipped=497"), ("ok", 0, "6 late on 2026-11-04")])
        envs = []
        orig = f.__call__
        e.runner = lambda cmd, env, *a: (envs.append(env), orig(cmd, env, *a))[1]
        e.tick()
        r = json.loads(db.execute("select result from runs where job='sync' and status='ok'").fetchone()[0])
        self.assertEqual(r["found"], {"inserted": 5, "skipped": 497})
        up = json.loads(envs[1]["HRPIPE_UPSTREAM"])
        self.assertEqual((up["from"], up["topic"], up["payload"]["inserted"]), ("sync", "attendance_synced", 5))
        d = json.loads(db.execute("select result from runs where job='digest'").fetchone()[0])
        self.assertEqual(d["found"], {"late": 6}); self.assertEqual(d["after"]["from"], "sync")

    def test_handoff_emitted_once_per_slot(self):
        db, e, f = self.two([("ok", 0, "Done inserted=1 skipped=1"), ("ok", 0, "")])
        e.tick(); e.tick()
        self.assertEqual(db.execute("select count(*) from handoffs").fetchone()[0], 1)

    def test_stale_handoff_does_not_release_digest(self):
        db, e, f = self.two([("ok", 0, "")])
        ledger.emit(db, "sync", "attendance_synced", "old", None, "2026-11-04T01:00:00Z", "x")   # 5h20m old > 120 min
        ledger.record(db, "sync", "2026-11-04T06:00", "skipped", reason="t")                      # sync slot itself already handled
        e.tick()
        self.assertEqual(f.calls, [])

    def test_triggered_job_runs_once_per_handoff_any_time(self):
        org = job(gate=None, idempotent=True, slots=["06:40"], window_min=1, triggers=["roster_synced"], trigger_window_min=180, alert_missed=False)
        f = Fake([("ok", 0, ""), ("ok", 0, "")])
        db, e = make({"org": org}, feeds(), self.T0, f)
        ledger.record(db, "org", "2026-11-04T06:40", "skipped", reason="t")
        ledger.emit(db, "roster", "roster_synced", "s", {"updated": 0}, "2026-11-04T06:10:00Z", "r1")
        e.tick(); e.tick()
        self.assertEqual(len(f.calls), 1)                                                          # consumed: not run twice
        ledger.emit(db, "roster", "roster_synced", "s2", {"updated": 1}, "2026-11-04T06:21:00Z", "r2")
        e.now_fn = lambda: self.T0 + dt.timedelta(minutes=2); e.tick()
        self.assertEqual(len(f.calls), 2)                                                          # a new hand-off triggers a new run

    def test_emit_if_only_when_found(self):
        j = job(gate=None, idempotent=True, slots=["06:00"], emits="employees_added", emit_if="created", parse=[r"Created: (?P<created>\d+)"])
        db, e = make({"nj": j}, feeds(), self.T0, Fake([("ok", 0, "Created: 0")]))
        e.tick()
        self.assertEqual(db.execute("select count(*) from handoffs").fetchone()[0], 0)
        db, e = make({"nj": j}, feeds(), self.T0, Fake([("ok", 0, "Created: 2")]))
        e.tick()
        self.assertEqual(db.execute("select count(*) from handoffs").fetchone()[0], 1)


class RealOutputs(unittest.TestCase):
    """The parse patterns against lines copied from the production logs."""
    def run_parse(self, name, text):
        from hrpipe import config, results
        return results.parse(config.JOBS[name], text)

    def test_attendance(self):
        self.assertEqual(self.run_parse("attendance_sync", "  Done — inserted=5  skipped=497  total=502  auto_provisioned=0\n[x] Sync complete"),
                         {"inserted": 5, "skipped": 497, "total": 502, "auto_provisioned": 0})
    def test_roster(self):
        self.assertEqual(self.run_parse("roster_new_joiners", "  Updated: 0 (of which deactivated: 0)\n  Created: 3\n  Unmatched: 64"), {"updated": 0, "deactivated": 0, "created": 3})
    def test_late_digest(self):
        self.assertEqual(self.run_parse("late_digest", "late-digest run finished: 6 late on 2026-11-04, emailed=True"), {"late": 6, "date": "2026-11-04", "emailed": True})
    def test_comp_off(self):
        self.assertEqual(self.run_parse("comp_off_accrual", "comp-off accrual: 3 credited, 1 already on file"), {"credited": 3, "already_on_file": 1})
    def test_clocks(self):
        self.assertEqual(self.run_parse("clocks_digest", "clocks-digest: {'aip': 0, 'probation': 1, 'notice': 0} on 2026-11-03, emailed=False, managers_emailed=0"),
                         {"aip": 0, "probation": 1, "notice": 0, "emailed": False})
    def test_leave(self):
        self.assertEqual(self.run_parse("leave_reminders", "leave-reminder run finished: 28 pending, 6/6 manager reminders sent, hr_emailed=True"),
                         {"pending": 28, "sent": 6, "managers": 6, "hr_emailed": True})
    def test_quarter(self):
        self.assertEqual(self.run_parse("quarter_red_card", "quarter-red-cards: Q2 FY 2026-27 (Jul–Sep) — 0 qualifying, 0 actioned, dry_run=False"),
                         {"quarter": "Q2 FY 2026-27 (Jul–Sep)", "qualifying": 0, "applied": 0})
    def test_org(self):
        self.assertEqual(self.run_parse("org_snapshot", "org snapshot written: 246 people, 29 departments, 18 heads low-confidence"), {"people": 246, "departments": 29})


if __name__ == "__main__":
    unittest.main()
