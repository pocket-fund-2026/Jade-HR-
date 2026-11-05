from email_service import ACCESS_SYSTEMS, access_revocation_text


def test_notice_stage_says_revoke_by_last_working_day():
    subject, body = access_revocation_text("notice", "Asha Rao", "E123", "2026-11-30")
    assert "Asha Rao (E123)" in subject and "2026-11-30" in subject
    assert "must be revoked by then" in body
    assert all(system in body for system in ACCESS_SYSTEMS)


def test_left_stage_says_revoke_now():
    subject, body = access_revocation_text("left", "Asha Rao", "E123", "2026-11-30")
    assert "has left JADE" in subject
    assert "revoked now" in body
    assert "Email / OMS / TDS Login Deactivation" in body


def test_roster_leavers_email_is_one_message_listing_everyone(monkeypatch):
    import email_service
    sent = []
    monkeypatch.setattr(email_service, "send_email_detailed", lambda to, subject, body, **kw: (sent.append((subject, body)) or (True, None)))
    assert email_service.notify_roster_leavers([("A B", "E1"), ("C D", "E2")], "hr@example.com")
    assert len(sent) == 1
    subject, body = sent[0]
    assert "2 people" in subject and "A B (E1)" in body and "C D (E2)" in body
    assert email_service.notify_roster_leavers([], "hr@example.com") is False
