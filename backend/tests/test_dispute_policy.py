from datetime import datetime, timezone

import dispute_policy as dp

FILED = "2026-11-25T06:00:00+00:00"


def d(**kw):
    base = {"date": "2026-11-24", "issue_type": "missed_clock_out", "claimed_in": None, "claimed_out": "19:00:00",
            "reason": "Forgot to punch out", "created_at": FILED}
    base.update(kw)
    return base


def rule(x, others=None):
    r = dp.evaluate(x, others)
    return r["rule"] if r else None


def test_clean_dispute_passes():
    assert rule(d()) is None


def test_future_date():
    assert rule(d(date="2026-11-26")) == "future_date"


def test_late_filing_boundary():
    assert rule(d(date="2026-11-18")) is None            # exactly 7 days
    r = dp.evaluate(d(date="2026-11-17"))
    assert r["rule"] == "late_filing" and "8 days" in r["reason"] and "7 days" in r["reason"]


def test_late_filing_uses_filed_date_not_today():
    # filed on time, still pending months later -> not late
    assert rule(d(date="2026-11-24", created_at="2026-11-25T06:00:00+00:00")) is None


def test_ist_date_of_filing():
    # 20:00 UTC on the 24th is already the 25th in IST
    assert dp.filed_on("2026-11-24T20:00:00+00:00").isoformat() == "2026-11-25"


def test_duplicate_only_pending_or_approved_same_day():
    other = {"id": "x", "date": "2026-11-24", "status": "pending"}
    assert rule(d(), [other]) == "duplicate"
    assert rule(d(), [{**other, "status": "rejected"}]) is None
    assert rule(d(), [{**other, "date": "2026-11-23"}]) is None
    assert rule(d(id="x"), [other]) is None              # itself
    assert rule(d(), [{**other, "appeal_of": "y"}]) is None


def test_missing_and_reversed_times():
    assert rule(d(claimed_out=None)) == "missing_times"
    assert rule(d(issue_type="missed_clock_in", claimed_in=None, claimed_out=None)) == "missing_times"
    assert rule(d(issue_type="both", claimed_in="19:00:00", claimed_out="10:00:00")) == "times_reversed"
    assert rule(d(issue_type="weekly_off", claimed_out=None)) is None
    assert rule(d(issue_type="other", claimed_out=None)) is None


def test_register_rule_needs_altered_wording():
    assert rule(d(reason="My register entry is there, please check")) is None
    assert rule(d(reason="The timing in the register is illegible")) == "register_entry"
    assert rule(d(reason="Entry was overwritten in the register")) == "register_entry"
    assert rule(d(reason="I changed my plan and left late")) is None


def test_appeals_never_auto_rejected():
    assert rule(d(appeal_of="abc", date="2026-01-01")) is None


def test_cutoff_hint():
    h = dp.cutoff_hint(datetime(2026, 11, 25).date())
    assert h["earliest_date"] == "2026-11-18"
