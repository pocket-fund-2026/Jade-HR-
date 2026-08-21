import { useState } from "react";

const SHIFT_TIMINGS = [
  { name: "Peddar Road", opening: "9:00 am", trading: "10:30 am – 8:00 pm", closing: "8:30 pm" },
  { name: "Emporio", opening: "10:30 am", trading: "11:00 am – 7:30 pm", closing: "8:00 pm" },
  { name: "Ambawatta", opening: "9:00 am", trading: "10:30 am – 8:00 pm", closing: "8:30 pm" },
  { name: "Ahmedabad", opening: "9:00 am", trading: "10:30 am – 8:00 pm", closing: "8:30 pm" },
  { name: "Hyderabad", opening: "9:00 am", trading: "10:30 am – 8:00 pm", closing: "8:30 pm" },
];

const HOLIDAYS_2026 = [
  { date: "1st Jan 2026", desc: "New Year", delhi: "Closed", hyderabad: "Closed", ahmedabad: "Closed", mumbai: "Closed" },
  { date: "26th Jan 2026", desc: "Republic Day", delhi: "Open; statutory pay", hyderabad: "Open; statutory pay", ahmedabad: "Open; statutory pay", mumbai: "Open; statutory pay" },
  { date: "4th March 2026", desc: "Holi", delhi: "Open from 3:00 PM", hyderabad: "Open from 3:00 PM", ahmedabad: "Open from 3:00 PM", mumbai: "Open from 3:00 PM" },
  { date: "1st May 2026", desc: "Labour Day", delhi: "Open", hyderabad: "Open", ahmedabad: "Open", mumbai: "Open; statutory pay" },
  { date: "15th Aug 2026", desc: "Independence Day", delhi: "Open; statutory pay", hyderabad: "Open; statutory pay", ahmedabad: "Open; statutory pay", mumbai: "Open; statutory pay" },
  { date: "2nd Oct 2026", desc: "Gandhi Jayanti", delhi: "Open; statutory pay", hyderabad: "Open; statutory pay", ahmedabad: "Open; statutory pay", mumbai: "Open; statutory pay" },
  { date: "9th Nov 2026", desc: "Diwali", delhi: "Closed", hyderabad: "Closed", ahmedabad: "Closed", mumbai: "Closed" },
  { date: "31st Dec 2026", desc: "New Year's Eve", delhi: "Open till 4:00 PM", hyderabad: "Open till 4:00 PM", ahmedabad: "Open till 4:00 PM", mumbai: "Open till 4:00 PM" },
];

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

const HOLIDAYS_2025 = [
  { date: "1st Jan 2025", day: "Wednesday", desc: "New Year" },
  { date: "26th Jan 2025", day: "Sunday", desc: "Republic Day" },
  { date: "14th March 2025", day: "Friday", desc: "Holi – Mumbai" },
  { date: "30th March 2025", day: "Sunday", desc: "Gudi Padwa" },
  { date: "1st May 2025", day: "Thursday", desc: "Labour Day" },
  { date: "15th Aug 2025", day: "Friday", desc: "Independence Day" },
  { date: "27th Aug 2025", day: "Wednesday", desc: "Ganesh Chaturthi" },
  { date: "2nd Oct 2025", day: "Thursday", desc: "Gandhi Jayanti & Dussehra" },
  { date: "21st Oct 2025", day: "Tuesday", desc: "Diwali" },
  { date: "22nd Oct 2025", day: "Wednesday", desc: "Diwali" },
  { date: "23rd Oct 2025", day: "Thursday", desc: "Diwali" },
];

const LATE_TIER_ROWS = [
  { arrival: "Up to 10:20 am", marking: "On time", deduction: "None" },
  { arrival: "10:21 am – 10:59 am", marking: "Late marking", deduction: "¼ day (0.25) from the 4th late marking" },
  { arrival: "11:00 am onwards", marking: "Late marking", deduction: "½ day (0.50) from the 4th late marking" },
];

const CARD_ROWS = [
  {
    card: "Yellow Card",
    trigger: "1st, 2nd and 3rd late marking in the month",
    consequence: "Warning only — no deduction, whatever time you arrived",
  },
  {
    card: "Red Card",
    trigger: "Late more than 3 times in the month",
    consequence:
      "Recorded against the month, shown on your dashboard and payslip. New Paid Leave and Comp-Off requests can't be self-submitted for the rest of that cycle (HR can still file an approved exception on your behalf).",
  },
  {
    card: "Quarter Red Card",
    trigger: "A Red Card in every month of a quarter",
    consequence: "Final Warning letter, and 2 days of Paid Leave are forfeited from your balance.",
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

// The late-arrival rules in force from 22 September 2026. Rendered both as its
// own policy tab and inline inside the 2026/2025 documents' own late-coming
// sections, so the rules appear where you'd look for them without the text
// being duplicated in three places and left to drift apart.
function LateArrivalRules() {
  return (
    <>
      <p>
        Grace time is <strong>20 minutes</strong>: you are on time until <strong>10:20 am</strong>, or 20 minutes past
        your rostered shift start if your shift begins later than 10:00 am. Arriving after that is recorded as a late
        marking.
      </p>
      <PolicyTable
        columns={["Arrival", "Recorded as", "Deduction"]}
        rows={LATE_TIER_ROWS.map((r) => [
          <span className="font-nums">{r.arrival}</span>, r.marking, r.deduction,
        ])}
      />
      <p>
        The <strong>first 3 late markings in a month carry no deduction at all</strong> — they are issued as a Yellow
        Card. Deductions begin at the 4th late marking, at the rate shown above for the time you arrived that day.
      </p>
      <p className="font-medium text-ink">Yellow Card, Red Card &amp; Quarter Red Card</p>
      <PolicyTable
        columns={["Card", "When it's issued", "What it means"]}
        rows={CARD_ROWS.map((r) => [<strong>{r.card}</strong>, r.trigger, r.consequence])}
      />
      <p>
        Quarters follow the financial year — April–June, July–September, October–December and January–March. A Quarter
        Red Card needs a Red Card in <em>all three</em> months of the quarter; the Final Warning letter and the 2-day
        Paid Leave forfeiture are issued once the quarter closes.
      </p>
    </>
  );
}

function LateArrivalInForceNote() {
  return (
    <p className="bg-manila/60 border-l-2 border-jade-600 px-4 py-3">
      <strong>In force from 22 September 2026.</strong> These late-arrival rules apply to all employees and replace the
      earlier grace window, deduction tiers and late-mark thresholds. The rest of this section still stands.
    </p>
  );
}

const LATE_COUNTING_ITEMS = [
  "Late markings are counted per pay cycle — the 23rd of one month to the 22nd of the next — the same period your payslip covers, so your card status always matches the payslip you're looking at.",
  "Late-arrival deductions are Loss of Pay. They are never adjusted against your Paid Leave balance (the only exception is the 2-day forfeiture that comes with a Quarter Red Card).",
  "Clock-in time comes from the biometric punch. If a punch is wrong or missing, raise an attendance dispute in the console rather than letting it stand — corrected timings are graded exactly like a real punch, on the time actually recorded.",
  "Your current cycle's late markings and card status are on your dashboard, so nothing here should ever come as a surprise at payslip time.",
];

function LatePolicySept2026() {
  return (
    <div className="space-y-6">
      <Section title="Late arrival — with effect from 22 September 2026">
        <p className="bg-manila/60 border-l-2 border-jade-600 px-4 py-3">
          This is the late-arrival policy currently in force, for <strong>all employees</strong>. It replaces the
          late-coming/grace rules in the 2026 and 2025 policies on the other tabs — where it also appears inline —
          and everything else in those documents (leave, comp-off, holidays, notice period, and so on) still stands
          unchanged.
        </p>
        <LateArrivalRules />
      </Section>

      <Section title="How this is counted">
        <Bullets
          items={[
            ...LATE_COUNTING_ITEMS,
            "Stay-back grace still applies: if you finished past 8:30 pm the previous day you may report by 11:00 am, and if you worked past midnight, by 12:00 pm — with your HOD's approval on record.",
          ]}
        />
        <p className="text-ink/60">
          Effective 22 September 2026. Anything unclear should be taken to the HR department — HR's interpretation is
          final, and policies are subject to change at management's discretion.
        </p>
      </Section>
    </div>
  );
}

function Policy2026() {
  return (
    <div className="space-y-6">
      <Section title="Retail store timings">
        <p>
          All employees have a grace buffer of 20 minutes from their shift time (until 10:20am on a 10:00am shift);
          the first 3 late markings in a month carry no deduction — see Early going &amp; late coming below. Retail teams work Monday–Saturday/Sunday with one weekly
          off (6-day work week), on a roster set by the department HOD. One team member must be present at opening to
          ready the front store and stay responsible for it during that window.
        </p>
        <div className="overflow-x-auto -mx-1">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink/60 border-b border-ink/10">
                <th className="py-2 px-1">Store</th>
                <th className="py-2 px-1">Opening</th>
                <th className="py-2 px-1">Trading time</th>
                <th className="py-2 px-1">Closing</th>
              </tr>
            </thead>
            <tbody className="font-nums">
              {SHIFT_TIMINGS.map((row) => (
                <tr key={row.name} className="border-b border-ink/5">
                  <td className="py-2 px-1 font-medium text-ink">{row.name}</td>
                  <td className="py-2 px-1">{row.opening}</td>
                  <td className="py-2 px-1">{row.trading}</td>
                  <td className="py-2 px-1">{row.closing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Early going &amp; late coming">
        <LateArrivalInForceNote />
        <LateArrivalRules />
        <Bullets
          items={[
            ...LATE_COUNTING_ITEMS,
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
        <p>
          Leave application form:{" "}
          <a
            href="https://forms.zohopublic.in/JADEbyMonicaandKarishma/form/Leaveapplicationform/formperma/w107-bKl4ikf_4GYWwaxecWolYLiWhITJxnt4S25vh4"
            target="_blank"
            rel="noreferrer"
            className="text-jade-600 underline"
          >
            forms.zohopublic.in — Leave Application Form
          </a>
        </p>
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
        <div className="overflow-x-auto -mx-1">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink/60 border-b border-ink/10">
                <th className="py-2 px-1">Date</th>
                <th className="py-2 px-1">Holiday</th>
                <th className="py-2 px-1">Delhi</th>
                <th className="py-2 px-1">Hyderabad</th>
                <th className="py-2 px-1">Ahmedabad</th>
                <th className="py-2 px-1">Mumbai</th>
              </tr>
            </thead>
            <tbody className="font-nums">
              {HOLIDAYS_2026.map((row) => (
                <tr key={row.date} className="border-b border-ink/5">
                  <td className="py-2 px-1">{row.date}</td>
                  <td className="py-2 px-1 font-medium text-ink">{row.desc}</td>
                  <td className="py-2 px-1">{row.delhi}</td>
                  <td className="py-2 px-1">{row.hyderabad}</td>
                  <td className="py-2 px-1">{row.ahmedabad}</td>
                  <td className="py-2 px-1">{row.mumbai}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-ink/50">This list is finalized by management and is not subject to change.</p>
      </Section>

      <Section title="Incentives">
        <Bullets
          items={[
            "Incentives are based on monthly target achievement, calculated per month.",
            "Paid out after each quarter closes — only for the months actually achieved, not a lump sum on cumulative target.",
            "Employees who hit target earn 1% commission on sales achieved, monthly.",
          ]}
        />
      </Section>

      <Section title="Women safety">
        <p>Post 9pm, all female employees are eligible to travel by Cab/Ola/Uber, with bills attached and submitted on time.</p>
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

function Policy2025() {
  return (
    <div className="space-y-6">
      <Section title="Timings by department">
        <Bullets
          items={[
            "Retail stores: 10:00am – 8:00pm, buffer 10:00–10:20am (from 22 Sept 2026), first 3 late markings free. Monday–Saturday/Sunday, 1 weekly off on a roster set by the department HOD.",
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
        <p>
          Leave application form:{" "}
          <a
            href="https://forms.zohopublic.in/JADEbyMonicaandKarishma/form/Leaveapplicationform/formperma/w107-bKl4ikf_4GYWwaxecWolYLiWhITJxnt4S25vh4"
            target="_blank"
            rel="noreferrer"
            className="text-jade-600 underline"
          >
            forms.zohopublic.in — Leave Application Form
          </a>
        </p>
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
        <div className="overflow-x-auto -mx-1">
          <table className="min-w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink/60 border-b border-ink/10">
                <th className="py-2 px-1">Date</th>
                <th className="py-2 px-1">Day</th>
                <th className="py-2 px-1">Festival / occasion</th>
              </tr>
            </thead>
            <tbody className="font-nums">
              {HOLIDAYS_2025.map((row) => (
                <tr key={row.date} className="border-b border-ink/5">
                  <td className="py-2 px-1">{row.date}</td>
                  <td className="py-2 px-1">{row.day}</td>
                  <td className="py-2 px-1 font-medium text-ink">{row.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
export const POLICY_TABS = [
  { key: "late-2026-09", label: "Late Arrival (from 22 Sept 2026)", render: LatePolicySept2026 },
  { key: "2026", label: "2026 Revision (Retail)", render: Policy2026 },
  { key: "2025", label: "2025 (Retail, Corporate & Factory)", render: Policy2025 },
];

const TABS = POLICY_TABS;

export default function PolicyDocument() {
  const [tab, setTab] = useState("late-2026-09");
  const Active = TABS.find((t) => t.key === tab)?.render ?? LatePolicySept2026;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Working Hours, Attendance &amp; Leave Policy</h1>
        <p className="text-sm text-ink/60 mt-1">
          The late-arrival rules effective 22 September 2026 apply to everyone, and appear on the first tab as well as
          inline in the late-coming section of each document below. For everything else, pick the version that applies
          to your department — where they disagree, HR's interpretation of which one governs is final.
        </p>
        <div className="flex gap-2 mt-4">
          {TABS.map((t) => (
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
      <Active />
    </div>
  );
}
