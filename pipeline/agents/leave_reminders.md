# leave_reminders: pending-leave reminders

**Job:** Email each approver their team's pending leave requests (oldest first, long-waiting flagged) and HR one company-wide summary; Mondays also counts active employees with no reporting manager.
**Code:** `../../leave_reminder_notify.py`; job `leave_reminders`
**Schedule (UTC):** 04:00 Mon-Sat (window 6h)
**Console API:** `POST /api/leave-reminders/digest`
**Waits for (hand-off):** nothing (time-driven)
**Sends (hand-off):** nothing (result `{pending, sent, managers, hr_emailed}` is recorded)
**Cost:** none (code only).

## Subagents
| subagent | what it does |
|---|---|
| reminder runner | calls the endpoint; the console groups requests per approver and sends |

## Rules & failure behaviour
- Sends email: retried only after a failed attempt. Sends nothing when nothing is pending.
