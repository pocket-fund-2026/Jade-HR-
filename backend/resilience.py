"""Shared resilience primitives: jittered exponential backoff + a circuit breaker.

State is in-process. On Vercel that means per warm container, which is still
useful: a container that keeps hitting a stalled Supabase edge stops piling
more requests onto it and fails fast with a 503 + Retry-After instead of
holding a 60s function slot open.
"""
import random
import threading
import time


def backoff_delay(attempt: int, base: float = 0.5, cap: float = 8.0) -> float:
    """Full-jitter exponential backoff. attempt is 0-based: 0 -> U(0, base),
    1 -> U(0, 2*base), 2 -> U(0, 4*base) ... capped at `cap`."""
    return random.uniform(0, min(cap, base * (2 ** attempt)))


class CircuitOpenError(Exception):
    def __init__(self, retry_after: float):
        super().__init__("Upstream temporarily unavailable")
        self.retry_after = max(1, int(retry_after + 0.999))


class CircuitBreaker:
    """closed -> (failure_threshold consecutive failures) -> open
    open -> (reset_timeout elapsed) -> half-open: ONE probe request allowed
    half-open -> success: closed; failure: open again."""

    def __init__(self, failure_threshold: int = 6, reset_timeout: float = 10.0, clock=time.monotonic):
        self.failure_threshold = failure_threshold
        self.reset_timeout = reset_timeout
        self._clock = clock
        self._lock = threading.Lock()
        self._failures = 0
        self._opened_at: float | None = None
        self._probe_in_flight = False

    @property
    def state(self) -> str:
        with self._lock:
            if self._opened_at is None:
                return "closed"
            if self._clock() - self._opened_at >= self.reset_timeout:
                return "half-open"
            return "open"

    def before_call(self) -> None:
        with self._lock:
            if self._opened_at is None:
                return
            elapsed = self._clock() - self._opened_at
            if elapsed < self.reset_timeout:
                raise CircuitOpenError(self.reset_timeout - elapsed)
            if self._probe_in_flight:
                raise CircuitOpenError(1)
            self._probe_in_flight = True

    def record_success(self) -> None:
        with self._lock:
            self._failures = 0
            self._opened_at = None
            self._probe_in_flight = False

    def record_failure(self) -> None:
        with self._lock:
            self._probe_in_flight = False
            self._failures += 1
            if self._failures >= self.failure_threshold or self._opened_at is not None:
                self._opened_at = self._clock()
