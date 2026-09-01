import { useEffect, useState } from "react";

import { Link } from "react-router-dom";

import api from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

const DAY_TYPE_LABELS = {
  closed: "Closed",
  day_off: "Day Off (paid, same as closed)",
  open_statutory: "Open; statutory pay",
  open_till_4pm: "Open till 4:00 PM",
  open_normal: "Open",
  anniversary: "Anniversary",
};

function formatHolidayDate(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Reads the caller's own holiday calendar (auto-scoped by location server
// side, GET /api/me/holidays) so this page never drifts from what the
// console's Holiday Calendar (admin/Policy.jsx) actually has on file —
// HR can add next year's dates there and this page just picks them up.
function useMyHolidays(year) {
  const [holidays, setHolidays] = useState([]);
  useEffect(() => {
    let cancelled = false;
    api.get("/api/me/holidays", { params: { year } }).then(({ data }) => {
      if (!cancelled) setHolidays(data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [year]);
  return holidays;
}

function useStoreTimings() {
  const [stores, setStores] = useState([]);
  useEffect(() => {
    api.get("/api/store-timings").then(({ data }) => setStores(data)).catch(() => {});
  }, []);
  return stores;
}

function LeaveLink() {
  const { user } = useAuth() || {};
  const to = user?.role === "employee" ? "/employee/my-leave" : "/admin/my-leave";
  return (
    <p>
      Apply for leave from this console's{" "}
      <Link to={to} className="text-jade-600 underline">My Leave</Link> section — leave no longer goes through the
      old Zoho form.
    </p>
  );
}

// Grouped location-wise (each store its own row), then state-wise (stores
// under the same state grouped together) per the retail policy rollout doc,
// rather than one flat list.
function groupStoresByState(stores) {
  const groups = new Map();
  for (const row of stores) {
    const state = row.state || "Other";
    if (!groups.has(state)) groups.set(state, []);
    groups.get(state).push(row);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

// `employeeLocation` (an hr_employees.location string, e.g. "Pedder Road,
// Mumbai") scopes the table to just that person's own store, matched by
// substring the same way holidays are location-matched in payroll.py's
// _holiday_applies. Omitted entirely (console/admin viewers with full
// access) shows every store, same as before.
function StoreTimingsTable({ employeeLocation }) {
  const stores = useStoreTimings();
  if (stores.length === 0) {
    return <p className="text-sm text-ink/70">No store timings on file yet — set them in the Leave Policy console.</p>;
  }
  const scoped = employeeLocation
    ? stores.filter((s) => employeeLocation.toLowerCase().includes(s.store.toLowerCase()))
    : stores;
  if (employeeLocation && scoped.length === 0) {
    return <p className="text-sm text-ink/70">No store timing on file yet for your location — check with HR.</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1 space-y-4">
      {groupStoresByState(scoped).map(([state, rows]) => (
        <div key={state}>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/60 mb-1">{state}</p>
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink/70 border-b border-ink/10">
                <th className="py-2 px-1">Store</th>
                <th className="py-2 px-1">Opening</th>
                <th className="py-2 px-1">Trading time</th>
                <th className="py-2 px-1">Closing</th>
              </tr>
            </thead>
            <tbody className="font-nums">
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-ink/5">
                  <td className="py-2 px-1 font-medium text-ink">{row.store}</td>
                  <td className="py-2 px-1">{row.opening}</td>
                  <td className="py-2 px-1">{row.trading}</td>
                  <td className="py-2 px-1">{row.closing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function HolidayTable({ year }) {
  const holidays = useMyHolidays(year);
  if (holidays.length === 0) {
    return <p className="text-sm text-ink/70">No holidays on file yet for {year} — set them in the Leave Policy console.</p>;
  }
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink/70 border-b border-ink/10">
            <th className="py-2 px-1">Date</th>
            <th className="py-2 px-1">Holiday</th>
            <th className="py-2 px-1">Status</th>
          </tr>
        </thead>
        <tbody className="font-nums">
          {holidays.map((h) => (
            <tr key={h.id} className="border-b border-ink/5">
              <td className="py-2 px-1">{formatHolidayDate(h.holiday_date)}</td>
              <td className="py-2 px-1 font-medium text-ink">{h.description}</td>
              <td className="py-2 px-1">
                {DAY_TYPE_LABELS[h.day_type] || h.day_type}
                {h.close_time && ` (${h.close_time.slice(0, 5)})`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-ink/70 mt-2">Shown for your own store/location. This list is finalized by management and is not subject to change.</p>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="bg-paper rounded-sm shadow-card p-5 sm:p-6">
      <h2 className="font-display text-lg text-ink mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-ink/80 leading-relaxed">{children}</div>
    </section>
  );
}

function Bullets({ items }) {
  return (
    <ul className="list-disc pl-5 space-y-1.5">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

const LATE_TIER_ROWS = [
  { arrival: "10:00 am or earlier", marking: "On time", deduction: "None" },
  { arrival: "10:01 am – 10:10 am", marking: "Daily Tolerance — Yellow Card", deduction: "None, every time, no monthly limit" },
  { arrival: "10:11 am – 10:20 am", marking: "Extended Monthly Buffer — Yellow Card", deduction: "None for the first 3 occurrences in the cycle; ¼ day (0.25) from the 4th onward" },
  { arrival: "10:21 am – 10:45 am", marking: "Level 1 — Late", deduction: "¼ day (0.25) + Yellow Card" },
  { arrival: "10:46 am – 11:45 am", marking: "Level 2 — Late", deduction: "¼ day (0.25) + Yellow Card" },
  { arrival: "11:46 am onwards", marking: "Level 3 — Severe Late", deduction: "½ day (0.50) + Yellow Card" },
];

const CARD_ROWS = [
  {
    card: "Yellow Card",
    trigger: "Every late arrival after 10:00 am — including a Daily Tolerance or Extended Buffer arrival that carries no deduction",
    consequence: "Recorded against the cycle, shown on your dashboard.",
  },
  {
    card: "Red Card",
    trigger: "7 Yellow Cards in one pay cycle",
    consequence:
      "You are placed on an Attendance Improvement Plan (AIP) for 30 or 60 days, set by HR. Only one late arrival is permitted during the entire AIP — a further late arrival is a failure of the AIP, which may lead to disciplinary action.",
  },
];

function PolicyTable({ columns, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm border-collapse">
        <thead>
          <tr className="bg-manila/60 text-left">
            {columns.map((c) => (
              <th key={c} className="border border-ink/10 px-3 py-2 font-semibold">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i}>
              {cells.map((cell, j) => (
                <td key={j} className={`border border-ink/10 px-3 py-2 ${j === 0 ? "whitespace-nowrap" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The late-arrival rules in force from the pay cycle beginning 23 August 2026. Rendered both as its
// own policy tab and inline inside the 2026/2025 documents' own late-coming
// sections, so the rules appear where you'd look for them without the text
// being duplicated in three places and left to drift apart.
function LateArrivalRules() {
  return (
    <>
      <p>
        Your official reporting time is <strong>10:00 am</strong> (or your rostered shift start, if it begins later).
        There is no blanket grace period before that time — arriving even a minute after is recorded as a late
        arrival, banded by how late, as below.
      </p>
      <PolicyTable
        columns={["Arrival", "Recorded as", "Deduction"]}
        rows={LATE_TIER_ROWS.map((r) => [
          <span className="font-nums">{r.arrival}</span>, r.marking, r.deduction,
        ])}
      />
      <p>
        Every late arrival earns a <strong>Yellow Card</strong>, even the penalty-free ones in the Daily Tolerance and
        Extended Monthly Buffer bands above — a deduction and a Yellow Card are two separate things. Only the
        Extended Monthly Buffer band (10:11–10:20 am) has a free allowance, and only for the first 3 occurrences in
        the cycle.
      </p>
      <p className="font-medium text-ink">Yellow Card &amp; Red Card</p>
      <PolicyTable
        columns={["Card", "When it's issued", "What it means"]}
        rows={CARD_ROWS.map((r) => [<strong>{r.card}</strong>, r.trigger, r.consequence])}
      />
    </>
  );
}

function LateArrivalInForceNote() {
  return (
    <p className="bg-manila/60 border-l-2 border-jade-600 px-4 py-3">
      <strong>In force from the pay cycle beginning 23 August 2026.</strong> These late-arrival rules apply to the
      corporate roster (retail and factory teams are not covered by this Yellow/Red Card/AIP system) and replace
      every earlier grace window, deduction tier and late-mark/Red Card threshold for corporate staff. The rest of
      this section still stands.
    </p>
  );
}

const LATE_COUNTING_ITEMS = [
  "Late markings, Yellow Cards and Red Cards are counted per pay cycle — the 23rd of one month to the 22nd of the next — the same period your payslip covers, so your card status always matches the payslip you're looking at.",
  "Late-arrival deductions are Loss of Pay, applied in ¼-day or ½-day units only.",
  "Clock-in time comes from the biometric punch, verified against CCTV timestamps where a punch is missing. If a punch is wrong or missing, raise an attendance dispute in the console rather than letting it stand — corrected timings are graded exactly like a real punch, on the time actually recorded.",
  "Your current cycle's late markings and card status are on your dashboard, so nothing here should ever come as a surprise at payslip time.",
  "Working from home is not an entitlement — it requires Senior Management/HR Head approval in advance and your Reporting Manager confirming the assigned work was completed, and is paid at 50% of that day's salary.",
];

// Policy2026's own two sections below are retail-operational specifics
// (store timings, retail late-coming) inside an otherwise shared document
// (leave/loan/reimbursement/holidays/women's-safety apply to everyone) — so
// rather than hiding this whole tab from corporate employees (which would
// also take away their 2026 holiday calendar and the women's-safety
// clause), only these two sections are gated by viewer category. Console
// users (accounts/hr) always see both, same as every other section here.
function Policy2026({ showRetailSections = true, employeeLocation }) {
  return (
    <div className="space-y-6">
      {showRetailSections && (
        <Section title="Retail store timings">
          <p>
            On-time cutoff is your own store/time slot's shift start (set per store below, by Nimit/HR in the console).
            Retail teams work Monday–Saturday/Sunday with one weekly off (6-day work week), on a roster set by the
            department HOD. One team member must be present at opening to ready the front store and stay responsible
            for it during that window.
          </p>
          <StoreTimingsTable employeeLocation={employeeLocation} />
        </Section>
      )}

      {showRetailSections && (
        <Section title="Early going &amp; late coming">
          <p className="bg-manila/60 border-l-2 border-jade-600 px-4 py-3">
            The Yellow Card / Red Card / Attendance Improvement Plan system (the "Attendance &amp; WFH Policy" tab)
            applies to the corporate roster only — it is not in force for retail. Lateness here is managed by your
            store's roster and your HOD, against your own shift's start time.
          </p>
          <Bullets
            items={[
              "Clock-in time comes from the biometric punch, verified against CCTV timestamps where a punch is missing. If a punch is wrong or missing, raise an attendance dispute in the console rather than letting it stand.",
              "Repeated late arrival is taken into account in performance appraisals.",
              "Early leaving and personal exigencies must be pre-approved by the reporting manager / department head.",
            ]}
          />
          <p>
            If called in on a holiday/Sunday for a work exigency (launches, events, trainings, shows, audits, deadlines,
            or similar), you're entitled to a compensatory off within the next 120 days, or as otherwise accepted by the
            HOD — approval must come via email from the HOD.
          </p>
        </Section>
      )}

      <Section title="Leave entitlement">
        <p>
          24 all-purpose leaves per year, credited on a pro-rata basis of 2 days/month after successful completion of
          probation (employees joining mid-year accrue pro-rata from their join date).
        </p>
        <Bullets
          items={[
            "5+ day leaves: apply at least 30 days in advance.",
            "3–4 day leaves: apply at least 15 days in advance.",
            "Up to 2 day leaves: apply at least 5 days in advance.",
            "Never proceed on leave until it's approved — unapproved leave is treated as absence and is unpaid, even against an available leave balance.",
            "Weekends/holidays inside a sanctioned leave period aren't counted as leave days.",
            "Set an Out-of-Office reply for the duration of leave, naming who is covering.",
            "Not rejoining on the date applied for turns the whole leave unapproved (leave without pay).",
            "Leave applications must name a handover owner.",
            "Colleagues covering the same role/work (e.g. SM/ASM/Regional Manager/FC pairs) cannot go on leave simultaneously.",
          ]}
        />
        <p className="font-medium text-ink">Encashment &amp; carry-forward</p>
        <Bullets
          items={[
            "No leave encashment other than at Full &amp; Final settlement, and only on accrued earned leave of the current year (calculated on basic salary, not gross).",
            "Up to 7 days can be carried into the next year; anything above 7 lapses.",
          ]}
        />
        <p className="font-medium text-ink">On resignation / termination</p>
        <Bullets
          items={[
            "Earned leave is calculated pro-rata to the last working day.",
            "Any unsanctioned leave taken after resignation is accepted is treated as leave-without-pay, even against a balance.",
            "Leave during the notice period is unpaid and not adjustable against a shorter notice period, unless HOD-approved.",
            "Current year's leave balance is encashed as part of the F&F settlement.",
            "F&F payout of earned leave requires: full required notice served, all company property returned in good condition, and manager confirmation of handover.",
          ]}
        />
        <p className="font-medium text-ink">Comp-off</p>
        <p>
          1 day comp-off for working a Saturday/Sunday/public holiday, to be taken within 30 days or it lapses,
          subject to reporting-manager/HOD approval. No more than 1 continuous comp-off at a time — additional
          continuous comp-off days become unpaid leave. Comp-off cannot be clubbed with other earned leave.
        </p>
        <p className="font-medium text-ink">Long / extended leave</p>
        <Bullets
          items={[
            "Leave beyond 2 continuous weeks needs 3-level approval: HOD/Reporting Manager, Head of HR, and Directors — granted only when planned well in advance or for genuine emergencies.",
            "Extending leave requires advance approval via the leave application form; unapproved extension is treated as absence and renders the whole leave unpaid.",
            "Absence beyond 2 weeks carries no notice-period protection — reinstatement isn't guaranteed even if someone was kept informed.",
          ]}
        />
      </Section>

      <Section title="Statutory &amp; special leave">
        <Bullets
          items={[
            "Maternity leave: 26 weeks for female employees with 1+ year of uninterrupted service (Maternity Benefit Act 1961), over and above other leave/holidays. Can start up to 10 weeks before expected delivery; case-by-case exceptions need senior-management approval.",
            "Paternity leave: 3 days for male employees, over and above other leave/holidays, with supporting documents. Must be taken within 15 days of the child's birth or it lapses.",
            "Compassionate / bereavement leave: 2 days, within 14 days of the death of an immediate family member (mother, father, spouse, children, sister, brother).",
          ]}
        />
      </Section>

      <Section title="General leave notes">
        <Bullets
          items={[
            "Leave is not a matter of right and can be refused for work exigencies — even after approval, it can be cancelled if exigencies arise.",
            "The policy (or any part of it) can be withdrawn, modified, or substituted at management's sole discretion, at any time.",
            "Overlapping leave within a department should be avoided at the planning stage.",
          ]}
        />
        <LeaveLink />
      </Section>

      <Section title="Loan">
        <Bullets
          items={[
            "Minimum 3 years of service and positive L1 feedback required to apply.",
            "Loan amount can be up to double the employee's salary, at 12% interest, repayable within one year.",
            "Only one loan can be active at a time — no new loan while one is outstanding.",
            "Medical/educational emergency loans need all supporting documents/proofs submitted at the time of application.",
            "Management can refuse a loan at its discretion — meeting eligibility criteria does not guarantee approval.",
          ]}
        />
      </Section>

      <Section title="Reimbursement (expenses)">
        <Bullets
          items={[
            <>
              All reimbursements go through the expense app:{" "}
              <a href="https://zfrmz.in/GeGtj13HiHnjHsLDfsgJ" target="_blank" rel="noreferrer" className="text-jade-600 underline">
                zfrmz.in expense form
              </a>
            </>,
            "Submit within 15 days of the expense, or before the 24th of the month to get approved in that month's cycle.",
            "Other expenses need a valid invoice or supporting document.",
            "Ola/Uber travel: upload the emailed bill.",
            "Local taxi (Kaali Peeli) travel needs a time-stamped photo — use the \"Timestamp Camera\" app if your phone doesn't stamp photos natively.",
          ]}
        />
      </Section>

      <Section title="Public holidays — 2026">
        <HolidayTable year={2026} />
      </Section>

      <Section title="Policy interpretation">
        <p>
          Explanation of any company policy should be sought from the HR department — HR's interpretation is final.
          Policies are subject to change at management's discretion.
        </p>
      </Section>
    </div>
  );
}

// Renders once, unconditionally, at the page level (see PolicyDocument
// below) rather than inside any one tab — applies to retail and corporate
// alike, so it must never be something a viewer could miss by staying on
// the "wrong" tab.
function WomenSafetySection() {
  return (
    <Section title="Women safety">
      <p>Post 10pm, all female employees are eligible to travel by Cab/Ola/Uber, with bills attached and submitted on time.</p>
    </Section>
  );
}

function Policy2025({ showCorporateSections = true }) {
  return (
    <div className="space-y-6">
      <Section title="Timings by department">
        <Bullets
          items={[
            "Retail stores: 10:00am – 8:00pm, on-time cutoff 10:00am with the tolerance/buffer bands below (from the pay cycle beginning 23 Aug 2026), first 3 Extended Buffer arrivals free. Monday–Saturday/Sunday, 1 weekly off on a roster set by the department HOD.",
            "Corporate office: 10:00am – 6:30pm, same 10-minute buffer. Monday–Saturday with all Saturdays as half-days. Work exigencies expect attendance, with a planned comp-off on another day, HOD and team informed.",
            "Factory & Inventory (raw material and finished goods): 10:00am – 7:00pm, Monday–Saturday, same buffer. 1 weekly off on Sunday unless called in by the HOD.",
            "OT-eligible departments (RM store, FG store, CAD, DEO): 10:00am – 7:00pm, Monday–Saturday. Non-OT departments: 10:00am – 6:30pm Monday–Friday, 10:00am – 3:00pm on Saturday.",
          ]}
        />
        <p className="font-medium text-ink">Partial-shift rounding</p>
        <p>
          Under 5 hours worked: leave without pay. Exactly 5 hours: ½ day. 6+ hours: ¾ day. 6.5 hours: ¾ day.
        </p>
        <p className="font-medium text-ink">Lunch &amp; breaks</p>
        <p>
          Lunch window is 1–2pm, 30 minutes per employee within that window (dept heads have flexible timing). Any
          break requires a biometric punch-out and punch-in; the break must fit inside the 30-minute lunch allowance —
          e.g. 15 minutes lunch + 15 minutes break. Longer breaks are deducted based on biometric data.
        </p>
        <p className="font-medium text-ink">Overtime</p>
        <p>
          OT is only for exceptional circumstances on HOD instruction, with prior email approval from the HOD for
          staying back.
        </p>
      </Section>

      {showCorporateSections ? (
        <Section title="Late-coming policy">
          <LateArrivalInForceNote />
          <LateArrivalRules />
          <Bullets items={LATE_COUNTING_ITEMS} />
          <p className="font-medium text-ink">Staying back late (not applicable to OT-eligible depts/designations)</p>
          <Bullets
            items={[
              "Stayed back past 8:30pm (2+ hours extra): may come in late the next day, up to 11:00am.",
              "Stayed back past 10:30pm (4+ hours extra): may come in late the next day, up to 12:00pm.",
              "Stayed back past midnight (6+ hours extra): eligible for a comp-off within 90 days.",
              "Needs HOD approval with the date and reason for staying back, to regularize the late-arrival grace.",
              "No grace time beyond the tiers above.",
            ]}
          />
          <p>
            If called in on a holiday/Sunday for a work exigency (launches, events, trainings, shows, audits,
            deadlines, or similar), you're entitled to a compensatory off within 90 days, or as otherwise accepted by
            the HOD — approval must come via email from the HOD, with the date awaited/worked noted.
          </p>
        </Section>
      ) : (
        <Section title="Late-coming policy">
          <p>
            The Yellow Card / Red Card / Attendance Improvement Plan system above applies to the corporate roster
            only — it is not in force for retail. Your applicable late-coming rules are under the "Early going &amp;
            late coming" section of the other tab.
          </p>
        </Section>
      )}

      <Section title="Leave entitlement">
        <p>
          24 all-purpose leaves per year, credited on a pro-rata basis of 2 days/month after successful completion of
          probation (employees joining mid-year accrue pro-rata from their join date).
        </p>
        <Bullets
          items={[
            "5+ day leaves: apply at least 30 days in advance.",
            "3–4 day leaves: apply at least 15 days in advance.",
            "Up to 2 day leaves: apply at least 5 days in advance.",
            "Never proceed on leave until it's approved — unapproved leave is treated as absence and is unpaid, even against an available leave balance.",
            "Weekends/holidays inside a sanctioned leave period aren't counted as leave days.",
            "Set an Out-of-Office reply for the duration of leave, naming who is covering.",
          ]}
        />
        <p className="font-medium text-ink">Encashment &amp; carry-forward</p>
        <Bullets
          items={[
            "Balance leave can be encashed at F&F, or once a year in January (application accepted till Jan 10th) — only the eligible carry-forward, capped at 15 days.",
            "Only accrued earned leave is eligible; anything above 15 days lapses. Calculated on basic salary, not gross.",
            "Up to 15 days can be carried into the next year — anything above lapses.",
          ]}
        />
        <p className="font-medium text-ink">On resignation / termination</p>
        <Bullets
          items={[
            "Earned leave is calculated pro-rata to the last working day, settled as encashment in the F&F.",
            "Leave during the notice period is disallowed unless HOD-approved, and can't be adjusted against a shorter notice period without management approval.",
            "Any shortfall in serving full notice is deducted from the F&F (e.g. serving only 15 of a required 30-day notice means those 15 days are recovered from the F&F); serving no notice at all, without consent, forfeits full pay and F&F, and the company will withhold relieving/experience/recommendation letters.",
            "Standard F&F processing timeline is 45 days from the last working day, subject to completed exit formalities and department clearance.",
          ]}
        />
        <p className="font-medium text-ink">Comp-off</p>
        <p>
          1 day comp-off for working a Sunday or public holiday, to be taken within 90 days or it lapses, subject to
          reporting-manager/HOD approval. Up to 3 continuous comp-off days are allowed — beyond 3 continuous days it
          counts as regular leave instead.
        </p>
        <p className="font-medium text-ink">Long / extended leave</p>
        <Bullets
          items={[
            "Leave beyond 2 continuous weeks needs 3-level approval: HOD/Reporting Manager, Head of HR, and Directors — granted only when planned well in advance or for genuine emergencies.",
            "Extending leave requires advance approval via the leave application form; unapproved extension is treated as absence and renders the whole leave unpaid.",
            "Absence beyond 2 weeks carries no notice-period protection — reinstatement isn't guaranteed even if someone was kept informed.",
            "The leave calendar year runs January–December.",
          ]}
        />
      </Section>

      <Section title="Statutory &amp; special leave">
        <Bullets
          items={[
            "Maternity leave: 26 weeks for female employees with 1+ year of uninterrupted service (Maternity Benefit Act 1961), over and above other leave/holidays. Can start up to 10 weeks before expected delivery; case-by-case exceptions need senior-management approval.",
            "Paternity leave: 3 days for male employees, over and above other leave/holidays, with supporting documents. Must be taken within 15 days of the child's birth or it lapses.",
            "Compassionate / bereavement leave: 2 days, within 14 days of the death of an immediate family member (mother, father, spouse, children, sister, brother).",
          ]}
        />
      </Section>

      <Section title="General leave notes">
        <Bullets
          items={[
            "Leave is not a matter of right and can be refused for work exigencies — even after approval, it can be cancelled if exigencies arise.",
            "The policy (or any part of it) can be withdrawn, modified, or substituted at management's sole discretion, at any time.",
            "Overlapping leave within a department should be avoided at the planning stage.",
          ]}
        />
        <LeaveLink />
      </Section>

      <Section title="Loan">
        <p>
          Minimum 3 years of service and positive L1 feedback required to apply. Loan amount can be up to double the
          employee's salary, at 12% interest, repayable within one year.
        </p>
      </Section>

      <Section title="Reimbursement (expenses)">
        <Bullets
          items={[
            <>
              All reimbursements go through the expense app:{" "}
              <a href="https://zfrmz.in/GeGtj13HiHnjHsLDfsgJ" target="_blank" rel="noreferrer" className="text-jade-600 underline">
                zfrmz.in expense form
              </a>
            </>,
            "Submit within 15 days of the expense, or before the 24th of the month to get approved in that month's cycle.",
            "Other expenses need a valid invoice or supporting document.",
            "Ola/Uber travel: upload the emailed bill.",
            "Local taxi (Kaali Peeli) travel needs a time-stamped photo — use the \"Timestamp Camera\" app if your phone doesn't stamp photos natively.",
          ]}
        />
      </Section>

      <Section title="Public holidays — 2025">
        <HolidayTable year={2025} />
      </Section>

      <Section title="Policy interpretation">
        <p>
          Explanation of any company policy should be sought from the HR department — HR's interpretation is final.
          Policies are subject to change at management's discretion.
        </p>
      </Section>
    </div>
  );
}

// Exported so the login-time acknowledgement gate
// (pages/PolicyAcknowledgement.jsx) shows exactly the same documents people
// are signing off on, and so the keys it records match the tabs one-for-one.
// Keys must stay in step with POLICY_DOCUMENTS in backend/routers/policy_ack.py.
// The former standalone "Attendance & WFH Policy (from 23 Aug 2026)" tab has
// been merged into "Corporate Policy" (its "Late-coming policy" section) per
// an explicit, repeated instruction — both remaining tabs now contain
// properly category-gated content for both retail and corporate, so neither
// tab needs hiding from either category any more. Labels dropped the year —
// user wants "Corporate Policy", not "2025 (...)"; the sibling tab was
// renamed to match rather than leave a stray "2026 Revision" label behind.
export const POLICY_TABS = [
  { key: "2026", label: "Retail Policy", render: Policy2026 },
  { key: "2025", label: "Corporate Policy", render: Policy2025 },
];

export default function PolicyDocument({ scope = "console" }) {
  const { user, can } = useAuth() || {};
  const employeeCategory = user?.employee_category;
  // Only Accounts, or an hr-role account Accounts has specifically granted
  // employees.manage/policy.manage to, get the full cross-category view from
  // the console (/policy-document) — everyone else, including a team lead
  // who lacks that permission, sees exactly what an employee of their own
  // employee_category would see. Employee scope (/employee/policy) is
  // always category-filtered, full stop.
  const seesEverything = scope !== "employee" && !!can?.("employees.manage", "policy.manage");
  const showRetailSections = seesEverything || employeeCategory !== "corporate";
  const showCorporateSections = seesEverything || employeeCategory === "corporate";
  const [tab, setTab] = useState("2026");

  const Active = POLICY_TABS.find((t) => t.key === tab)?.render ?? POLICY_TABS[0].render;
  const description = seesEverything
    ? "Full document, all categories — as an admin/HR view. Regular employees only see the sections that apply to their own role."
    : showCorporateSections
      ? "You're seeing the corporate view. Retail-specific sections (store timings, retail late-coming) aren't shown, and aren't part of your policy."
      : "You're seeing the retail view. The Yellow/Red Card Attendance & WFH Policy is corporate-only and isn't shown, and isn't part of your policy.";
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Working Hours, Attendance &amp; Leave Policy</h1>
        <p className="text-sm text-ink/70 mt-1">
          {description} For everything else, where two documents disagree, HR's interpretation of which one governs
          is final.
        </p>
        <div className="flex gap-2 mt-4">
          {POLICY_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-sm text-sm font-medium border transition-colors ${
                tab === t.key
                  ? "bg-ledger-800 text-manila border-ledger-800"
                  : "bg-paper text-ink/70 border-ink/15 hover:border-ink/30"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <WomenSafetySection />
      <Active
        showRetailSections={showRetailSections}
        showCorporateSections={showCorporateSections}
        employeeLocation={seesEverything ? null : user?.location}
      />
    </div>
  );
}
