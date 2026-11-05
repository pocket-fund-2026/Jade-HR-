"""Declarative job graph. Times are UTC (the VPS clock). Each job keeps the schedule it had in /etc/cron.d/jade-hr-sync;
what changes is that the order is enforced (gates) and every attempt is recorded.

Fields
  slots        "HH:MM" start times. Only the most recent slot that has started is considered, so a missed slot is superseded.
  window_min   how long after a slot starts the job may still be attempted/retried.
  dow          cron-style weekdays (1=Mon..7=Sun) or None for every day.  months/dom: calendar restriction (quarter jobs).
  gate         None | "attendance"  (biometric feed fresh + readiness not 'not_ready')  | "attendance_roster" (also roster feed ok).
  idempotent   True = safe to re-run after success; the ledger still records one success per slot, so this only documents intent.
               False = the job SENDS EMAIL or APPLIES A PENALTY: retried only after an attempt that provably failed.
  success_re   output must match this in addition to exit code 0 (verification, not trust).
  preview      optional command run first; the real command only runs if the preview succeeds.
  alert_missed False = do not alert when a slot's window closes without success (used where another check covers it).
  emits        topic of the hand-off this job sends when it succeeds (what it found travels with it); emit_if = only if that parsed field > 0.
  parse        regexes with named groups run over the job's output: the structured result passed downstream and shown in `status`.
  after        {"topic", "within_min"}: do not run until a hand-off of that topic was sent in the last within_min minutes (the usual
               slot time is still the earliest start). Runs by itself, within one tick, once the upstream job lands.
  triggers     [topics]: also run once per unconsumed hand-off of these topics, at any time of day (trigger_window_min, default 180).
  enabled      False = defined but never run (needs a human decision to turn on).
"""
import os

ROOT = "/root/jade-hr"
PY = "python3"
LOG = "/var/log"


def _every(start_h, end_h, step_min):
    """HH:MM slots every step_min minutes from start_h:00 through end_h:59."""
    return [f"{m // 60:02d}:{m % 60:02d}" for m in range(start_h * 60, end_h * 60 + 60, step_min)]


JOBS = {
    "attendance_sync": dict(
        cmd=[PY, f"{ROOT}/biometric_sync.py"], slots=["23:00", "04:00", "04:30", "05:00", "05:30", "06:00", "07:00"],
        window_min=180, gate=None, idempotent=True, max_attempts=36, timeout_s=240, retry_min=5, alert_missed=False,
        success_re=r"Sync complete|Nothing to push\.", log=f"{LOG}/jade-hr-biometric-sync.log",
        emits="attendance_synced", parse=[r"inserted=(?P<inserted>\d+)\s+skipped=(?P<skipped>\d+)\s+total=(?P<total>\d+)(?:\s+auto_provisioned=(?P<auto_provisioned>\d+))?"]),
    "roster_sync": dict(
        cmd=[PY, f"{ROOT}/employee_roster_sync.py"], slots=["06:30"], window_min=240, gate=None, idempotent=True,
        max_attempts=4, timeout_s=900, retry_min=20, success_re=None, log=f"{LOG}/jade-hr-roster-sync.log",
        emits="roster_synced", parse=[r"Updated: (?P<updated>\d+) \(of which deactivated: (?P<deactivated>\d+)\)", r"Created: (?P<created>\d+)"]),
    "roster_new_joiners": dict(
        cmd=[PY, f"{ROOT}/employee_roster_sync.py", "--new-only"], slots=_every(3, 15, 15),
        window_min=14, gate=None, idempotent=True, alert_missed=False, max_attempts=1, timeout_s=300, retry_min=15, success_re=None,
        log=f"{LOG}/jade-hr-roster-sync.log", emits="employees_added", emit_if="created",
        parse=[r"Updated: (?P<updated>\d+) \(of which deactivated: (?P<deactivated>\d+)\)", r"Created: (?P<created>\d+)"]),
    # Code-only org chart snapshot the agents read (see pipeline/org_snapshot.py). Read-only against the console; no email.
    "org_snapshot": dict(
        cmd=[PY, f"{ROOT}/pipeline/org_snapshot.py"], slots=["06:40"], window_min=360, gate=None, idempotent=True,
        max_attempts=6, timeout_s=120, retry_min=15, success_re=r"org snapshot written", log=f"{LOG}/jade-hr-org-snapshot.log",
        triggers=["roster_synced", "employees_added"], trigger_window_min=180, emits="org_updated",
        parse=[r"org snapshot written: (?P<people>\d+) people, (?P<departments>\d+) departments"]),
    "late_digest": dict(
        cmd=[PY, f"{ROOT}/late_digest_notify.py"], slots=["06:15"], window_min=360, gate="attendance", idempotent=False,
        max_attempts=12, timeout_s=180, retry_min=5, success_re=r"late-digest run finished", log=f"{LOG}/jade-hr-late-digest.log",
        after={"topic": "attendance_synced", "within_min": 120}, parse=[r"(?P<late>\d+) late on (?P<date>[\d-]+), emailed=(?P<emailed>\w+)"]),
    "leave_reminders": dict(
        cmd=[PY, f"{ROOT}/leave_reminder_notify.py"], slots=["04:00"], dow={1, 2, 3, 4, 5, 6}, window_min=360, gate=None,
        idempotent=False, max_attempts=6, timeout_s=180, retry_min=10, success_re=r"leave-reminder run finished",
        log=f"{LOG}/jade-hr-leave-reminders.log", parse=[r"(?P<pending>\d+) pending, (?P<sent>\d+)/(?P<managers>\d+) manager reminders sent, hr_emailed=(?P<hr_emailed>\w+)"]),
    "clocks_digest": dict(
        cmd=[PY, f"{ROOT}/clocks_digest_notify.py"], slots=["08:05"], window_min=360, gate="attendance", idempotent=False,
        max_attempts=6, timeout_s=180, retry_min=10, success_re=None, log=f"{LOG}/jade-hr-clocks-digest.log",
        parse=[r"clocks-digest: \{'aip': (?P<aip>\d+), 'probation': (?P<probation>\d+), 'notice': (?P<notice>\d+)\} on [\d-]+, emailed=(?P<emailed>\w+)"]),
    "comp_off_accrual": dict(
        cmd=[PY, f"{ROOT}/comp_off_accrual.py"], slots=["08:10"], window_min=360, gate="attendance", idempotent=True,
        max_attempts=6, timeout_s=180, retry_min=10, success_re=None, log=f"{LOG}/jade-hr-comp-off.log",
        after={"topic": "attendance_synced", "within_min": 240}, parse=[r"comp-off accrual: (?P<credited>\d+) credited, (?P<already_on_file>\d+) already on file"]),
    # Was NOT scheduled anywhere before this pipeline (found 2026-11-04). It puts salaries on hold, so it stays off until HR/the user
    # decides it should run daily. Turn on with: HRPIPE_ENABLE_ABSENCE_HOLD=1 in /etc/hr-pipeline.env
    "absence_hold": dict(
        cmd=[PY, f"{ROOT}/absence_hold_notify.py"], slots=["08:20"], window_min=360, gate="attendance_roster", idempotent=False,
        max_attempts=6, timeout_s=180, retry_min=10, success_re=None, log=f"{LOG}/jade-hr-absence-hold.log", after={"topic": "attendance_synced", "within_min": 240},
        enabled=os.environ.get("HRPIPE_ENABLE_ABSENCE_HOLD") == "1"),
    # Final Warning letter + forfeiture of 2 PL days. Preview first; apply only if the preview is clean AND attendance + roster are fresh.
    "quarter_red_card": dict(
        cmd=[PY, f"{ROOT}/quarter_red_card_notify.py"], preview=[PY, f"{ROOT}/quarter_red_card_notify.py", "--dry-run"],
        slots=["09:00"], months={3, 6, 9, 12}, dom={23}, window_min=900, gate="attendance_roster", idempotent=False,
        max_attempts=6, timeout_s=240, retry_min=30, success_re=r"quarter-red-cards:", log=f"{LOG}/jade-hr-quarter-red-card.log",
        after={"topic": "attendance_synced", "within_min": 360}, parse=[r"quarter-red-cards: (?P<quarter>.+?) — (?P<qualifying>\d+) qualifying, (?P<applied>\d+) actioned"]),
}

ENV_FILES = ["/etc/jade-hr-sync.env"]          # credentials for the scripts (never printed)
ALERT_ENV = "/etc/hr-ha-monitor.env"           # ALERT_EMAIL / ALERT_FROM / RESEND_API_KEY, shared with the HA monitor
STATE_DIR = "/var/lib/jade-hr-pipeline"
LEDGER = f"{STATE_DIR}/ledger.db"
LOCK = "/var/lock/jade-hr-pipeline.lock"
PIPE_LOG = f"{LOG}/jade-hr-pipeline.log"
JADE_HR_URL = os.environ.get("JADE_HR_URL", "https://jade-hr.vercel.app")
DOWN_ALERT_AFTER_MIN = 15   # one email per incident, only once something has been down this long. No reminders, no 'recovered', no success mails.
