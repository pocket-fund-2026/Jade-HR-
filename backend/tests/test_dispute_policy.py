from datetime import datetime, timezone

import dispute_policy as dp

FILED = "2026-11-25T06:00:00+00:00"


def d(**kw):
    base = {"date": "2026-11-24", "issue_type": "missed_clock_out", "claimed_in": None, "claimed_out": "19:00:00",
            "reason": "Forgot to punch out", "created_at": FILED}
    base.update(kw)
    return base


def rule(x, others=None):
    r = dp.evaluate(x, others, max_age_days=7)
    return r["rule"] if r else None


def test_clean_dispute_passes():
    assert rule(d()) is None


def test_future_date():
    assert rule(d(date="2026-11-26")) == "future_date"


def test_late_filing_boundary():
    assert rule(d(date="2026-11-18")) is None            # exactly 7 days
    r = dp.evaluate(d(date="2026-11-17"), max_age_days=7)
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
    h = dp.cutoff_hint(datetime(2026, 11, 25).date(), max_age_days=7)
    assert h["earliest_date"] == "2026-11-18"


def test_delay_reason_not_needed_when_on_time():
    assert dp.delay_reason_problem(0, "") is None
    assert dp.delay_reason_problem(1, "") is None


def test_delay_reason_required_and_must_be_detailed():
    assert dp.delay_reason_problem(3, "") is not None
    assert dp.delay_reason_problem(3, "was busy") is not None
    assert dp.delay_reason_problem(3, "sorry sorry sorry sorry sorry sorry sorry sorry sorry sorry") is not None
    good = "I was on a client visit out of Mumbai with no network and only noticed the missed punch when I opened my payslip today."
    assert dp.delay_reason_problem(3, good) is None


def test_days_late_counts_from_filing_day():
    assert dp.days_late("2026-11-22", "2026-11-25T06:00:00+00:00") == 3


def test_store_visit_claim_needs_a_geotag_checkin_when_enabled():
    claim = d(reason="I was on a store visit that day and forgot to punch out")
    assert dp.evaluate(claim, [], max_age_days=7, movement=[], geotag_enabled=True)["rule"] == "store_visit_unproven"
    assert dp.evaluate(claim, [], max_age_days=7, movement=[{"status": "approved"}], geotag_enabled=True) is None
    assert dp.evaluate(claim, [], max_age_days=7, movement=[{"status": "pending"}], geotag_enabled=True) is None
    assert dp.evaluate(claim, [], max_age_days=7, movement=[{"status": "rejected"}], geotag_enabled=True)["rule"] == "store_visit_unproven"
    # not enabled for this person: never rejected for it
    assert dp.evaluate(claim, [], max_age_days=7, movement=[], geotag_enabled=False) is None
    assert dp.evaluate(d(), [], max_age_days=7, movement=[], geotag_enabled=True) is None
