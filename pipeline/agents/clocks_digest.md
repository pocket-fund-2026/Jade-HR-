# clocks_digest: upcoming clocks digest

**Job:** Email HR and affected reporting managers every active AIP, probation completion or notice-period exit in the red/amber zone. Sends nothing when nothing is urgent.
**Code:** `../../clocks_digest_notify.py`; job `clocks_digest`
**Schedule (UTC):** 08:05 earliest (window 6h)
**Console API:** `POST /api/clocks/digest`
**Waits for (hand-off):** the data-readiness gate (no attendance hand-off needed: it depends on dates, not punches)
**Sends (hand-off):** nothing (result `{aip, probation, notice, emailed}` is recorded)
**Cost:** none (code only).

## Subagents
| subagent | what it does |
|---|---|
| gate | readiness check |
| digest runner | calls the endpoint; the console decides who is urgent and who to email |

## Rules & failure behaviour
- Sends email: retried only after a failed attempt.
