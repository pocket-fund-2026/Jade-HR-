# JADE HR — What the HR Team Can Do

A detailed summary of the admin console at **https://jade-hr.vercel.app**, scoped to the HR role specifically — what's yours by default, and the exact rules the system applies (leave accrual, OT, deductions) so you can explain a figure to an employee with confidence.

## Contents

1. [Logging in](#logging-in)
2. [My Leave](#my-leave)
3. [My Payslip](#my-payslip)
4. [Employees](#employees)
5. [Disputes](#disputes)
6. [Leave (managing the team's requests)](#leave-managing-the-teams-requests)
7. [Leave Entry](#leave-entry)
8. [Letters](#letters)
9. [Leave Policy](#leave-policy)
10. [Glossary](#glossary)
11. [Status colors, everywhere](#status-colors-everywhere)
12. [Troubleshooting](#troubleshooting)

---

## Logging in

Go to **https://jade-hr.vercel.app** and sign in with your **Employee Code** and password.

- No self-service password change yet — ask Accounts to reset it from your Employees profile if needed.
- 5 wrong attempts locks the account temporarily; Accounts clears this the same way.
- A couple of things (Payroll & OT figures, most Reports, Leave Policy, Letters) are switched on per person rather than given to every HR login by default — if something below isn't in your sidebar, that's a permission that hasn't been turned on for you yet, not a bug.

---

## My Leave

Your own leave — same as any employee.

**Leave types and how much you get:**

| Type | Standard roster | Corporate roster |
|---|---|---|
| Casual | 12/year | 12/year |
| Sick | 12/year | 12/year |
| Earned / Privilege (PL) | 15/year, available in full from Jan 1 (or your Date of Joining if later that year) | 24/year, **accrued 2 days per completed month**, capped at 24 |
| Paternity | — | 3/year |
| Maternity, Compassionate | — | uncapped, case-by-case |
| Unpaid, Other | uncapped | uncapped |
| Comp-Off | — | earned, not allocated — see below |

Corporate roster: Privilege Leave isn't usable until **3 months after your Date of Joining**, and it accrues monthly rather than landing as a lump sum.

**Comp-Off** (corporate roster only): earned by working a declared weekly-off or a "Store closed"/"Day Off" holiday — but it's not automatic. Someone with the right access has to manually confirm it happened before it lands in your balance. It expires **120 days** after being earned, and a single leave request can use at most **2 Comp-Off days**.

**Submitting a request:** pick a type, start date, end date, an optional reason, **Submit Request**. It goes to your leave approver / manager and shows a status:

- **Pending** (amber) — no decision yet.
- **Approved** (green) — locked in, reflected on your attendance and payslip.
- **Rejected** (red) — check the note underneath.

No self-service cancel/edit once submitted — ask your approver if you need to withdraw one.

If you approve other people's leave (you're set as someone's leave approver/manager), you'll also see a **Team Leave** view scoped to just your reports.

---

## My Payslip

Same detail an employee sees for their own pay, plus one extra step: **your own payslip needs sign-off before it's final.**

### The pay period

Runs **23rd of one month to the 22nd of the next** — "July 2026" covers June 23 – July 22. Use **‹ ›** to move between periods.

### Reading it

**Attendance summary:** Present / WeeklyOff / Holiday / LeaveAdj / Paid Days / Without Pay / Total Days.

**Earnings** — Basic, HRA, Conveyance, Other Allowance, Monthly Bonus, Retention, Incentive, plus OT. Attendance-prorated (a Without Pay day reduces these); OT is calculated separately and always uses the full monthly rate.

**Overtime formula**, shown on the payslip itself:
```
Total Salary    = Basic + HRA + Conveyance
Per Day Salary  = Total Salary ÷ Days in the month
Per Hour Salary = Per Day Salary ÷ Standard Hours per Day (default 8)
OT Amount       = Per Hour Salary × Total OT Hours worked that period
```

**Deductions** — only what applies to you shows up:

| Deduction | Basis |
|---|---|
| PF | 12% of Basic (capped if a limit is set on your profile) |
| ESIC | 0.75% of gross wages — only if gross is ≤ ₹21,000/month |
| PT (Professional Tax) | State-specific — e.g. Maharashtra ₹200/month (₹300 in Feb) above ₹7,500 gross; Delhi has no PT at all |
| LWF | Small state-specific amount, **only deducted on the June and December payslips** |
| TDS | Projected annual income tax, divided across the financial year's remaining months |

**Leave ledger** (corporate roster): Privilege Leave Opening / Debit / Credit / Closing for the period.

**Late-coming & Red Card** (corporate roster): arriving after **10:10 AM** counts as late. First 2 late arrivals per cycle are free; the 3rd onward — or any arrival after **12:00 noon** regardless of count — costs a ½-day Loss of Pay. **5 or more** late marks in one cycle triggers a **Red Card**: any leave day that cycle (not already unpaid or corrected) also becomes Loss of Pay.

### Submitting for approval

Click **Submit for Approval** to send that period to whoever signs off on HR's own payslips:

- **Pending** — awaiting a decision.
- **Approved** — done.
- **Rejected** — read the note, fix it, then **Resubmit for Approval** (replaces the same record rather than creating a new one).

**Print / Save as PDF** is available at the top of the payslip.

---

## Employees

*(on by default for HR)*

The full staff directory:

- Search/browse everyone, active or exited.
- Open a record to see/edit basic info, designation, department, location, salary components, compliance details (PF/ESIC/PT/LWF applicability, PAN/UAN/Aadhar/bank details), personal info, and key dates (Date of Joining, Exit Date, Scheduled Exit Date, gratuity service-start date).
- Add a new employee.
- Reset a password or unlock a login.
- View Salary Structure history (versioned CTC snapshots over time).

Exit Date / Scheduled Exit Date set here is what makes exit-related figures (final settlement, gratuity) calculate correctly for that person.

---

## Disputes

*(on by default for HR)*

Where employees' reported missed-punch issues land — they report a day where clock-in or clock-out didn't register, with what they claim the actual time was and why.

For each pending one: confirm/adjust the actual times and **Approve** (corrects their attendance for that day) or **Reject** with a note. Filter by store location if you only handle certain stores.

---

## Leave (managing the team's requests)

*(on by default for HR)*

Every leave request across the whole roster awaiting a decision — not just people reporting to you. Approve or reject with an optional note. Approving a Comp-Off request deducts it from that person's ledger (blocked if their balance no longer covers it).

---

## Leave Entry

*(on by default for HR)*

Record leave on someone's behalf when it didn't come through their own leave request — same types and rules as My Leave apply.

---

## Letters

*(needs `letters.generate` or `letters.manage`)*

Generate employee letters (offer, experience, warning, termination, etc.) from templates. Pick a letter type and an employee — name, code, designation, department, Date of Joining, and address auto-fill from their record; everything else you type in, and it's all editable before generating. Fields like a KRA list or termination reasons accept multiple lines and get auto-formatted as a numbered/bulleted list. Generated letters are printable.

`letters.manage` additionally lets you create/edit the templates; `letters.generate` alone just lets you produce letters from existing ones.

---

## Leave Policy

*(needs `employees.manage` or `policy.manage`)*

Three tabs:

**Holiday Calendar** — company holidays, which can vary per store. Each entry has a **Type**:

| Type | Effect |
|---|---|
| Store closed | Paid like a weekly-off |
| Day Off | Same pay treatment as Store closed — a distinct label for a company-granted day off |
| Open (statutory pay) | Store operates, statutory holiday pay applies |
| Open till a set time | Shortened schedule |
| Open (no special pay) | Normal operation |
| Anniversary | Informational only — no effect on attendance or pay |

Only **Store closed** and **Day Off** count toward Comp-Off if worked (corporate roster only).

**Comp-Off** — manually grant it after confirming someone worked a weekly-off or closed/Day-Off holiday (½ day if ≤4 hours worked, full day otherwise). Shows their full ledger — earned, used, expired.

**Birthdays** — upcoming birthdays for the HQ team, soonest first, with a quick way to add/correct a date of birth.

---

## Glossary

| Term | Meaning |
|---|---|
| PF | Provident Fund — retirement savings, 12% of Basic |
| ESIC | Employee State Insurance — health-cover contribution below a wage ceiling |
| PT | Professional Tax — state-level, varies by location |
| LWF | Labour Welfare Fund — small half-yearly (June/Dec) contribution |
| TDS | Tax Deducted at Source |
| OT | Overtime |
| PL | Privilege Leave (a.k.a. Earned Leave) |
| Comp-Off | Compensatory day off earned for working a weekly-off/holiday |
| LOP | Loss of Pay |

---

## Status colors, everywhere

- **Amber / pending** — waiting on a decision.
- **Green / approved** — signed off.
- **Red / rejected** — sent back; check the attached note.

---

## Troubleshooting

- **Can't see a section this guide describes** → it's permission-gated; ask Accounts to switch it on for you.
- **Forgot your password** → ask Accounts to reset it from your Employees profile.
- **A leave balance looks off** → remember PL accrues monthly for corporate roster (not a Jan 1 lump sum) and resets each calendar year — the first pay period of a new year can look slightly off for a day or two around the boundary; that's a known minor edge case, not a data error.
