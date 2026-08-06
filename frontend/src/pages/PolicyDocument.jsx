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

export default function PolicyDocument() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink">Working Hours, Attendance &amp; Leave Policy</h1>
        <p className="text-sm text-ink/60 mt-1">Revised 2026 · working days Monday–Saturday · no work-from-home policy at JADE</p>
      </div>

      <Section title="Retail store timings">
        <p>
          All employees have a buffer of coming late by 10 minutes (basis their shift time) for up to three times a
          month — see Early Going &amp; Late Coming below. Retail teams work Monday–Saturday/Sunday with one weekly
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
        <p>
          Grace time is 10 minutes per shift (e.g. until 10:10am, or 10 minutes past the rostered shift time), after
          which you are marked late. No deduction for the first 3 late markings in a month.
        </p>
        <Bullets
          items={[
            "4th late mark onward: pay cut applies.",
            "Reaching 11–29 minutes late (up to 10:30am or half an hour past rostered time): ¼-day deduction each time.",
            "Reaching 30+ minutes late: ½-day deduction each time, and it affects performance appraisals.",
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
