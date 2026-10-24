import asyncio

import pytest

from resilience import CircuitBreaker, CircuitOpenError, backoff_delay


class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def test_backoff_is_bounded_and_grows():
    for attempt in range(8):
        for _ in range(50):
            assert 0 <= backoff_delay(attempt, base=0.5, cap=8.0) <= min(8.0, 0.5 * 2 ** attempt)


def test_breaker_opens_then_half_open_probe_then_closes():
    c = Clock()
    b = CircuitBreaker(failure_threshold=3, reset_timeout=10, clock=c)
    for _ in range(3):
        b.before_call()
        b.record_failure()
    assert b.state == "open"
    with pytest.raises(CircuitOpenError) as e:
        b.before_call()
    assert e.value.retry_after >= 1
    c.t = 11
    assert b.state == "half-open"
    b.before_call()  # the single probe
    with pytest.raises(CircuitOpenError):
        b.before_call()  # others still rejected while probe is in flight
    b.record_success()
    assert b.state == "closed"
    b.before_call()


def test_breaker_failed_probe_reopens():
    c = Clock()
    b = CircuitBreaker(failure_threshold=1, reset_timeout=5, clock=c)
    b.before_call(); b.record_failure()
    c.t = 6
    b.before_call(); b.record_failure()
    assert b.state == "open"


def test_success_resets_failure_count():
    b = CircuitBreaker(failure_threshold=3)
    for _ in range(2):
        b.before_call(); b.record_failure()
    b.before_call(); b.record_success()
    for _ in range(2):
        b.before_call(); b.record_failure()
    assert b.state == "closed"


def test_transport_breaker_is_per_instance_and_writes_not_retried():
    import httpx
    import database

    calls = {"n": 0}

    class Boom(httpx.HTTPTransport):
        pass

    t1, t2 = database._RetryingTransport(), database._RetryingTransport()
    assert t1.breaker is not t2.breaker

    orig = httpx.HTTPTransport.handle_request

    def fail(self, request):
        calls["n"] += 1
        raise httpx.ReadTimeout("x")

    httpx.HTTPTransport.handle_request = fail
    database.time.sleep = lambda s: None
    try:
        with pytest.raises(httpx.ReadTimeout):
            t1.handle_request(httpx.Request("POST", "http://x/rest/v1/t"))
        assert calls["n"] == 1  # a write is never replayed
        calls["n"] = 0
        with pytest.raises(httpx.ReadTimeout):
            t1.handle_request(httpx.Request("GET", "http://x/rest/v1/t"))
        assert calls["n"] == 3  # reads retried
        for _ in range(6):
            t1.breaker.record_failure()
        with pytest.raises(CircuitOpenError):
            t1.handle_request(httpx.Request("GET", "http://x/rest/v1/t"))
        assert t2.breaker.state == "closed"  # standby unaffected
    finally:
        httpx.HTTPTransport.handle_request = orig
