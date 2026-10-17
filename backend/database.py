import time
import os

import httpx
from supabase import create_client
from supabase.lib.client_options import SyncClientOptions

from config import SUPABASE_SERVICE_KEY, SUPABASE_URL
from resilience import CircuitBreaker, backoff_delay

# Vercel reuses warm function containers across invocations, and Supabase's
# edge sometimes closes an idle keep-alive connection right as we try to
# reuse it — surfaces as httpx.RemoteProtocolError("Server disconnected").
# postgrest-py's own retry (send_with_retry) only retries HTTP 503/520
# responses, never a connection-level error like this one, so it always
# propagated straight through as a 500. httpx's transport-level `retries`
# is built for exactly this case: on a connection error it opens a fresh
# connection and retries once, transparently — no protocol/timing changes.
#
# That `retries=` kwarg only covers the CONNECT phase though — it never
# retries once a request has actually been sent. In production this left a
# second, much more common failure completely uncovered: Supabase's edge
# occasionally accepts the connection but then stalls or 504s mid-request
# (seen live 2026-09-24/25 on /api/payslip-approvals, /api/leave-requests,
# /api/absence-requests, /api/wfh-requests, /api/onboarding/* and even
# get_current_user itself — i.e. every authenticated endpoint, at random),
# surfacing as httpx.ReadTimeout or a 504 "Gateway Timeout" body that
# postgrest-py's own send_with_retry() ignores (it only retries 503/520).
# Because get_current_user runs this same client on every request, one of
# these mid-request stalls silently 500s whatever page happened to hit it —
# which is what made a bunch of employees' payslips/leave/etc. "disappear"
# with no pattern: it was never about who they were, just bad luck on a
# stalled connection. _RetryingTransport below retries both cases itself,
# below postgrest, so postgrest never even sees the failure.
_RETRIED_STATUS_CODES = {502, 504}
_MAX_READ_RETRIES = 2


_CONNECT_ERRORS = (httpx.ReadTimeout, httpx.ConnectError, httpx.ConnectTimeout)


class _RetryingTransport(httpx.HTTPTransport):
    """Retries safe (read) requests with jittered exponential backoff and fails
    fast through a circuit breaker once the database keeps failing.

    The breaker is per transport instance on purpose: in HA mode the local and
    Supabase clients each get their own transport, so an outage on one never
    blocks the other (a shared breaker would defeat the failover). Non-read
    requests are never replayed, since the first attempt may have committed
    (see ha.py), but they still count toward the breaker and respect it."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.breaker = CircuitBreaker(failure_threshold=6, reset_timeout=10.0)

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        self.breaker.before_call()
        if request.method not in {"GET", "HEAD", "OPTIONS"}:
            try:
                response = super().handle_request(request)
            except _CONNECT_ERRORS:
                self.breaker.record_failure()
                raise
            self._record(response)
            return response
        for attempt in range(_MAX_READ_RETRIES + 1):
            try:
                response = super().handle_request(request)
            except _CONNECT_ERRORS:
                if attempt == _MAX_READ_RETRIES:
                    self.breaker.record_failure()
                    raise
                time.sleep(backoff_delay(attempt))
                continue
            if response.status_code in _RETRIED_STATUS_CODES and attempt < _MAX_READ_RETRIES:
                response.close()
                time.sleep(backoff_delay(attempt))
                continue
            self._record(response)
            return response
        return response  # pragma: no cover — loop always returns/raises above

    def _record(self, response: httpx.Response) -> None:
        if response.status_code in _RETRIED_STATUS_CODES:
            self.breaker.record_failure()
        else:
            self.breaker.record_success()


if os.environ.get("HR_HA_ENABLED", "false").lower() == "true":
    from ha import HAProxy
    supabase = HAProxy(
        SUPABASE_URL, SUPABASE_SERVICE_KEY,
        os.environ["HR_HA_STANDBY_URL"], os.environ["HR_HA_STANDBY_KEY"],
        lambda: _RetryingTransport(retries=1),
    )
else:
    supabase = create_client(
        SUPABASE_URL, SUPABASE_SERVICE_KEY,
        options=SyncClientOptions(httpx_client=httpx.Client(transport=_RetryingTransport(retries=1))),
    )


def maybe_single_data(resp):
    """`.maybe_single().execute()` returns bare `None` (not a response object
    with `.data = None`) whenever zero rows match — accessing `.data` on that
    directly raises AttributeError instead of behaving like a graceful
    not-found. Always route a maybe_single() result through this."""
    return resp.data if resp else None
