"""Per-IP sliding-window rate limiting (ASGI middleware).

In-memory, so on Vercel each warm container counts separately: this is an
abuse backstop, not an exact quota. Limits are deliberately generous because
a whole office (hundreds of employees) can share one NAT'd public IP — the
per-account lockout in routers/auth.py is the tight control on login guessing.
"""
import os
import threading
import time
from collections import defaultdict, deque

from starlette.responses import JSONResponse

LOGIN_LIMIT = int(os.environ.get("RATE_LIMIT_LOGIN_PER_MIN", "60"))
API_LIMIT = int(os.environ.get("RATE_LIMIT_API_PER_MIN", "1500"))
WINDOW_SECONDS = 60
EXEMPT_PREFIXES = ("/api/health", "/api/biometric/ingest")  # ingest is secret-authenticated, called from the VPS
_MAX_TRACKED_KEYS = 20000


class SlidingWindowLimiter:
    def __init__(self, clock=time.monotonic):
        self._clock = clock
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window: float = WINDOW_SECONDS) -> float:
        """Returns 0 if allowed (and records the hit), else seconds until a slot frees."""
        now = self._clock()
        with self._lock:
            if len(self._hits) > _MAX_TRACKED_KEYS:
                self._hits = defaultdict(deque, {k: v for k, v in self._hits.items() if v and now - v[-1] < window})
            q = self._hits[key]
            while q and now - q[0] >= window:
                q.popleft()
            if len(q) >= limit:
                return max(0.1, window - (now - q[0]))
            q.append(now)
            return 0.0


def client_ip(scope) -> str:
    headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
    # Vercel overwrites x-forwarded-for with the real client address.
    fwd = headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


class RateLimitMiddleware:
    def __init__(self, app, limiter: SlidingWindowLimiter | None = None):
        self.app = app
        self.limiter = limiter or SlidingWindowLimiter()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] == "OPTIONS":
            return await self.app(scope, receive, send)
        path = scope["path"]
        if path.startswith(EXEMPT_PREFIXES):
            return await self.app(scope, receive, send)
        ip = client_ip(scope)
        checks = [(f"api:{ip}", API_LIMIT)]
        if path == "/api/login" or path.endswith("/login"):
            checks.append((f"login:{ip}", LOGIN_LIMIT))
        for key, limit in checks:
            wait = self.limiter.check(key, limit)
            if wait:
                resp = JSONResponse(
                    {"detail": "Too many requests. Please slow down and try again shortly."},
                    status_code=429,
                    headers={"Retry-After": str(int(wait) + 1)},
                )
                return await resp(scope, receive, send)
        return await self.app(scope, receive, send)
