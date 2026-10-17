import asyncio

import pytest

from ratelimit import RateLimitMiddleware, SlidingWindowLimiter
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


def test_sliding_window_limiter():
    c = Clock()
    lim = SlidingWindowLimiter(clock=c)
    assert all(lim.check("ip", 3) == 0 for _ in range(3))
    assert lim.check("ip", 3) > 0
    assert lim.check("other", 3) == 0
    c.t = 61
    assert lim.check("ip", 3) == 0


def _call(mw, path, ip="1.2.3.4", method="GET"):
    sent = []

    async def app(scope, receive, send):
        await send({"type": "http.response.start", "status": 200, "headers": []})
        await send({"type": "http.response.body", "body": b"ok"})

    async def send(m):
        sent.append(m)

    scope = {"type": "http", "method": method, "path": path, "headers": [(b"x-forwarded-for", ip.encode())]}
    mw.app = app
    asyncio.run(mw(scope, None, send))
    return sent[0]["status"]


def test_middleware_429_on_login_flood_but_not_other_ip_or_health():
    mw = RateLimitMiddleware(None, SlidingWindowLimiter())
    import ratelimit
    ratelimit.LOGIN_LIMIT = 2
    statuses = [_call(mw, "/api/login", method="POST") for _ in range(3)]
    assert statuses == [200, 200, 429]
    assert _call(mw, "/api/login", ip="9.9.9.9", method="POST") == 200
    for _ in range(5):
        assert _call(mw, "/api/health") == 200


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
