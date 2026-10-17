# JADE HR: reliability notes

## Built
| Concern | Where |
|---|---|
| Rate limiting | `backend/ratelimit.py`: per-IP sliding window. 60/min on login, 1500/min overall (env: `RATE_LIMIT_LOGIN_PER_MIN`, `RATE_LIMIT_API_PER_MIN`). Per-account lockout still lives in `routers/auth.py`. In-memory, so per warm Vercel container. |
| Retries + exponential backoff | `backend/database.py` retries 502/504/read+connect timeouts with full-jitter backoff (`backend/resilience.py`). `frontend/src/lib/api.js` retries GETs only (429/502/503/504/network), honouring Retry-After. |
| Circuit breaker | `supabase_breaker` in `database.py`: opens after 6 failed calls, 10s cool-off, single half-open probe. Open circuit returns 503 + Retry-After. |
| Timeouts | Every cron script and `email_service.py` already set explicit timeouts; Vercel `maxDuration` is 60s. |
| Idempotency | `backend/idempotency.py`: an identical pending leave/WFH/absence/dispute submission within 10 min returns the original row (no duplicate, no second email). Comp-off ledger, quarter-red-card and biometric ingest were already idempotent. |
| CI/CD | `.github/workflows/ci.yml` (pytest + frontend build). Vercel still builds and deploys, and `vercel.json` already gates on pytest. |
| Docker | `Dockerfile`, `docker-compose.yml`, `.dockerignore`: same FastAPI app for staging or a VPS. |
| Health | `/api/health` (pre-existing) is the container HEALTHCHECK. |

## Deliberately not built (no fit for one function + one database)
Load balancer, reverse proxy / API gateway (Vercel is both), Kubernetes, service discovery,
message queue, pub/sub, event-driven architecture, saga / distributed transactions.
Cron + idempotent scripts already do the queue's job. For multi-table writes that must be
all-or-nothing, the right tool is a Postgres RPC function (one transaction), not a saga.
