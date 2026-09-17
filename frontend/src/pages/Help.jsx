import { HelpCircle, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { useAuth } from "../lib/auth.jsx";

// A single collapsible topic. `keywords` is extra text (not necessarily
// rendered) the search box also matches against, so e.g. searching "red
// card" finds the Late-Coming topic even though that exact phrase isn't in
// the visible body copy verbatim.
function Topic({ title, keywords = "", tag, children, open, onToggle }) {
  return (
    <details
      open={open}
      onToggle={(e) => onToggle(e.target.open)}
      className="bg-paper rounded-sm shadow-card overflow-hidden"
    >
      <summary className="cursor-pointer select-none list-none px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-manila/30 transition-colors">
        <span className="font-display text-base text-ink">{title}</span>
        {tag && (
          <span className="flex-shrink-0 text-[10px] uppercase tracking-wider font-semibold text-jade-700 bg-jade-500/10 px-2 py-0.5 rounded-sm">
            {tag}
          </span>
        )}
      </summary>
      <div className="px-5 pb-5 pt-1 text-sm text-ink/80 space-y-3 leading-relaxed" data-search-text={keywords}>
        {children}
      </div>
    </details>
  );
}

function Table({ head, rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {head.map((h) => (
              <th key={h} className="text-left text-[11px] uppercase tracking-wider text-ink/60 border-b border-ink/10 py-1.5 pr-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-ink/[0.06] last:border-0">
              {r.map((c, j) => (
                <td key={j} className="py-1.5 pr-4 align-top">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 mr-4">
      <span className={`w-2 h-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

// ── GETTING STARTED / EVERYONE ──────────────────────────────────────────
const GETTING_STARTED = [
  {
    id: "logging-in",
    title: "Logging in",
    keywords: "login password locked account employee code",
    body: (
      <>
        <p>Go to <strong>jade-hr.vercel.app</strong> and sign in with your <strong>Employee Code</strong> and password.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Employee Code is assigned once your biometric attendance is set up (see "New joinee onboarding" below) — you can't log in before that.</li>
          <li>5 wrong password attempts locks the account temporarily; HR/Accounts can clear this from your Employees profile.</li>
          <li>No self-service password reset yet — ask HR/Accounts, or use "Change password" in the header once you're logged in to set your own.</li>
          <li>What you see in the sidebar depends on your role (employee vs. HR vs. Accounts) and, for HR logins, which specific permissions Accounts has switched on for you. A missing section usually means a permission hasn't been granted — not a bug.</li>
        </ul>
      </>
    ),
  },
  {
    id: "onboarding-process",
    title: "New joinee onboarding — how it actually works",
    keywords: "onboarding new employee form biometric employee code public join",
    body: (
      <>
        <p>Before a new joinee has any login at all, they fill in the <strong>public onboarding form</strong> at <code className="bg-manila/50 px-1 rounded-sm">/onboarding/new</code> — no employee code or password needed to reach it. It replaces the old external form and collects personal details, employment details, bank details, and document uploads (Aadhar, PAN, photo, resume).</p>
        <p className="font-semibold text-ink">What happens after submitting:</p>
        <ol className="list-decimal pl-5 space-y-1">
          <li>The submission lands in a review queue (Onboarding, in the admin console) — it is <strong>not</strong> yet an employee record.</li>
          <li>Separately, HR enrolls the new joinee on the biometric attendance device. Their first punch, or the next nightly roster sync from that device, assigns them a real <strong>Employee Code</strong>.</li>
          <li>The system automatically matches the pending submission to that new code by name (and, where possible, work location) and resolves it — filling in the employee record with everything from the form (bank details, address, documents, etc.).</li>
          <li>If the automatic match can't uniquely tell who's who (e.g. two pending submissions with very similar names), it's left for HR to resolve by hand rather than guessing — this is a deliberate safety choice so one person's bank/Aadhar details never get attached to someone else's record.</li>
        </ol>
        <p>Once resolved, the new employee can log in with their Employee Code, and (once linked) can see everything they originally submitted under <strong>My Onboarding Details</strong> in their own dashboard.</p>
      </>
    ),
  },
  {
    id: "status-colors",
    title: "Status colors, everywhere",
    keywords: "pending approved rejected color badge amber green red",
    body: (
      <div>
        <StatusDot color="bg-ochre-500" label="Amber / Pending — waiting on a decision" />
        <StatusDot color="bg-jade-600" label="Green / Approved — signed off" />
        <StatusDot color="bg-rust-500" label="Red / Rejected — sent back, check the note" />
        <p className="mt-2">This convention is the same everywhere in the app — leave, WFH, disputes, loans, work absence, onboarding, payslip approvals.</p>
      </div>
    ),
  },
  {
    id: "glossary",
    title: "Glossary",
    keywords: "PF ESIC PT LWF TDS OT PL comp off LOP acronyms",
    body: (
      <Table
        head={["Term", "Meaning"]}
        rows={[
          ["PF", "Provident Fund — retirement savings, 12% of Basic"],
          ["ESIC", "Employee State Insurance — health-cover contribution below a wage ceiling"],
          ["PT", "Professional Tax — state-level, varies by location"],
          ["LWF", "Labour Welfare Fund — small half-yearly (June/Dec) contribution"],
          ["TDS", "Tax Deducted at Source"],
          ["OT", "Overtime"],
          ["PL", "Privilege Leave (a.k.a. Earned Leave)"],
          ["Comp-Off", "Compensatory day off earned for working a weekly-off/holiday"],
          ["LOP", "Loss of Pay"],
          ["WFH", "Work From Home"],
          ["KRA", "Key Result Area — the core responsibilities listed for a role"],
          ["AIP", "Attendance Improvement Plan — a monitoring period for repeated attendance issues"],
        ]}
      />
    ),
  },
  {
    id: "troubleshooting",
    title: "Troubleshooting",
    keywords: "cant see missing section permission error problem broken",
    body: (
      <ul className="list-disc pl-5 space-y-1">
        <li><strong>Can't see a section this guide describes</strong> — it's permission-gated; ask Accounts to switch it on for you (HR logins only — Accounts logins already see everything).</li>
        <li><strong>Forgot your password</strong> — ask HR/Accounts to reset it from your Employees profile.</li>
        <li><strong>A leave balance looks off</strong> — remember Privilege Leave accrues monthly for the corporate roster (not a Jan 1 lump sum) and resets each calendar year; the first pay period of a new year can look slightly off for a day or two around the boundary.</li>
        <li><strong>Just submitted the onboarding form and nothing shows up yet</strong> — that's expected. It only becomes a real employee record once a biometric employee code is assigned and matched (see "New joinee onboarding" above); this can take up to a day (the roster sync runs nightly).</li>
        <li><strong>Redirected to the login page when visiting a public link</strong> — clear your browser cache/cookies for jade-hr.vercel.app and try again; if it persists, tell HR/Accounts which link you used.</li>
      </ul>
    ),
  },
];

// ── EMPLOYEE SELF-SERVICE ────────────────────────────────────────────────
const EMPLOYEE_SECTIONS = [
  {
    id: "my-onboarding",
    title: "My Onboarding Details",
    keywords: "my onboarding view submitted form bank documents",
    body: (
      <p>
        A read-only view of everything you originally submitted on the joining-formalities form — personal details,
        address, bank details, and links to the documents you uploaded. This only appears once your submission has
        been linked to your employee record (see "New joinee onboarding" above). If something here looks wrong,
        tell HR — corrections have to be made on your actual employee record, not on the original form.
      </p>
    ),
  },
  {
    id: "my-leave",
    title: "My Leave",
    keywords: "leave casual sick privilege PL earned comp off maternity paternity",
    body: (
      <>
        <Table
          head={["Type", "Standard roster", "Corporate roster"]}
          rows={[
            ["Casual", "12/year", "12/year"],
            ["Sick", "12/year", "12/year"],
            ["Earned / Privilege (PL)", "15/year, available in full from Jan 1 (or your Date of Joining if later)", "24/year, accrued 2 days per completed month, capped at 24"],
            ["Paternity", "—", "3/year"],
            ["Maternity, Compassionate", "—", "uncapped, case-by-case"],
            ["Unpaid, Other", "uncapped", "uncapped"],
            ["Comp-Off", "—", "earned, not allocated — see below"],
          ]}
        />
        <p>Corporate roster: Privilege Leave isn't usable until <strong>3 months after your Date of Joining</strong>, and it accrues monthly rather than landing as a lump sum.</p>
        <p><strong>Comp-Off</strong> (corporate roster only): earned by working a declared weekly-off or a "Store closed"/"Day Off" holiday — but it's not automatic; HR has to confirm it happened before it lands in your balance. It expires <strong>120 days</strong> after being earned, and a single leave request can use at most <strong>2 Comp-Off days</strong>.</p>
        <p><strong>Submitting a request:</strong> pick a type, start date, end date, an optional reason, Submit Request. It goes to your leave approver/manager. No self-service cancel/edit once submitted — ask your approver if you need to withdraw one.</p>
        <p>If you approve other people's leave (you're set as someone's leave approver), you'll also see a <strong>Team Leave</strong> view scoped to just your reports.</p>
      </>
    ),
  },
  {
    id: "my-payslip",
    title: "My Payslip",
    keywords: "payslip salary pay period overtime OT deductions PF ESIC PT LWF TDS late red card",
    body: (
      <>
        <p>The pay period runs <strong>23rd of one month to the 22nd of the next</strong> — "July" covers June 23 – July 22.</p>
        <p><strong>Attendance summary:</strong> Present / WeeklyOff / Holiday / LeaveAdj / Paid Days / Without Pay / Total Days.</p>
        <p><strong>Earnings</strong> — Basic, HRA, Conveyance, Other Allowance, Monthly Bonus, Retention, Incentive, plus OT. Attendance-prorated (a Without Pay day reduces these); OT is calculated separately and always uses the full monthly rate:</p>
        <pre className="bg-manila/50 rounded-sm p-3 text-xs font-nums whitespace-pre-wrap">{`Total Salary    = Basic + HRA + Conveyance
Per Day Salary  = Total Salary ÷ Days in the month
Per Hour Salary = Per Day Salary ÷ Standard Hours per Day (default 8)
OT Amount       = Per Hour Salary × Total OT Hours worked that period`}</pre>
        <p><strong>Deductions</strong> — only what applies to you shows up:</p>
        <Table
          head={["Deduction", "Basis"]}
          rows={[
            ["PF", "12% of Basic (capped if a limit is set on your profile)"],
            ["ESIC", "0.75% of gross wages — only if gross is ≤ ₹21,000/month"],
            ["PT (Professional Tax)", "State-specific — e.g. Maharashtra ₹200/month (₹300 in Feb) above ₹7,500 gross; Delhi has no PT at all"],
            ["LWF", "Small state-specific amount, only deducted on the June and December payslips"],
            ["TDS", "Projected annual income tax, divided across the financial year's remaining months"],
          ]}
        />
        <p><strong>Late-coming & Red Card</strong> (corporate roster): arriving after <strong>10:10 AM</strong> counts as late. First 2 late arrivals per cycle are free; the 3rd onward — or any arrival after <strong>12:00 noon</strong> regardless of count — costs a ½-day Loss of Pay. <strong>5 or more</strong> late marks in one cycle triggers a Red Card: any leave day that cycle (not already unpaid or corrected) also becomes Loss of Pay.</p>
        <p>Print / Save as PDF is available at the top of the payslip.</p>
      </>
    ),
  },
  {
    id: "tax-declaration",
    title: "Tax Declaration",
    keywords: "tax declaration 80c HRA exemption investment",
    body: <p>Declare your planned tax-saving investments and exemptions for the financial year, so your TDS projection (see My Payslip) reflects them instead of assuming zero deductions.</p>,
  },
  {
    id: "team-leave-wfh-market",
    title: "Team Leave / Team WFH / Team Market Visits (approvers only)",
    keywords: "approver manager team requests approve reject",
    body: (
      <p>
        Only visible if you're set as someone's approver. Shows the leave, work-from-home, or market-visit requests
        from your direct reports, awaiting your decision — approve or reject with an optional note.
      </p>
    ),
  },
  {
    id: "company-policy-employee",
    title: "Company Policy",
    keywords: "policy acknowledge quiz read",
    body: (
      <p>
        The company policy document. You're required to read and acknowledge it (and may need to pass a short
        comprehension quiz) — this gate reappears whenever HR publishes a new policy version, not just once at
        joining.
      </p>
    ),
  },
];

// ── ADMIN CONSOLE (HR / ACCOUNTS) ───────────────────────────────────────
const ADMIN_SECTIONS = [
  {
    id: "employees",
    title: "Employees",
    tag: "employees.view",
    keywords: "directory staff add employee salary structure compliance",
    body: (
      <>
        <p>The full staff directory — search/browse everyone, active or exited.</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Open a record to see/edit basic info, designation, department, location, salary components, compliance details (PF/ESIC/PT/LWF applicability, PAN/UAN/Aadhar/bank details), personal info, and key dates (Date of Joining, Exit Date, Scheduled Exit Date, gratuity service-start date).</li>
          <li>Add a new employee directly (separate from the onboarding-form flow below), reset a password, or unlock a login.</li>
          <li>View Salary Structure history (versioned CTC snapshots over time).</li>
        </ul>
        <p>Exit Date / Scheduled Exit Date set here is what makes exit-related figures (final settlement, gratuity) calculate correctly for that person.</p>
      </>
    ),
  },
  {
    id: "onboarding-admin",
    title: "Onboarding",
    tag: "onboarding.manage",
    keywords: "new joinee review resolve employee code approve reject public form",
    body: (
      <>
        <p>Where submissions from the public <code className="bg-manila/50 px-1 rounded-sm">/onboarding/new</code> form land, tabbed Pending / Approved / Rejected. Open one to see everything the joinee submitted, including compensation figures and bank details if you also have <code className="bg-manila/50 px-1 rounded-sm">salary.view</code>.</p>
        <p><strong>Most submissions now resolve themselves</strong> — the nightly roster sync matches a newly-assigned biometric employee code back to the right pending submission by name and fills in the employee record automatically (see "New joinee onboarding" under Getting Started). You'll mainly need to act here when:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>The automatic match couldn't uniquely identify who's who (e.g. duplicate-looking names) — resolve it manually with the correct Employee Code, Initial Password, and Employee Category (Factory/Retail vs. Corporate).</li>
          <li>A submission should be rejected outright (didn't actually join, duplicate submission, etc.).</li>
          <li>Someone needs their record created before any biometric device involvement at all — you can still enter an Employee Code manually the same way; if that code doesn't exist yet, it creates a brand-new employee record, and if it already exists (e.g. from a first punch), it attaches these details onto that existing record instead.</li>
        </ul>
      </>
    ),
  },
  {
    id: "careers",
    title: "Careers",
    tag: "careers.manage",
    keywords: "job posting applicant recruiting hiring",
    body: <p>Manage job postings and review applicants for open roles — create/edit job listings and track candidates through the pipeline.</p>,
  },
  {
    id: "work-absence",
    title: "Work Absence",
    tag: "absence.manage",
    keywords: "absence self service unplanned leave",
    body: <p>Employee self-reported absences (separate from the formal leave system) — review and approve/reject with supporting notes/attachments, tabbed Pending / Approved / Rejected.</p>,
  },
  {
    id: "confirmations",
    title: "Confirmations",
    tag: "employees.manage",
    keywords: "probation confirm due date",
    body: <p>Tracks who's due for confirmation after probation, who has no probation date set at all, and who's already confirmed — so nobody's confirmation date is missed.</p>,
  },
  {
    id: "exit-procedure",
    title: "Exit Procedure",
    tag: "exit.manage",
    keywords: "resignation offboarding checklist final settlement",
    body: <p>The full offboarding checklist for an exiting employee — sign-offs from each relevant department, notes, and status — feeding into final settlement and gratuity calculations (which rely on the Exit Date / Scheduled Exit Date set on their Employees record).</p>,
  },
  {
    id: "leave-admin",
    title: "Leave (managing the team's requests)",
    tag: "leave.manage",
    keywords: "approve reject leave requests all employees",
    body: <p>Every leave request across the whole roster awaiting a decision — not just people reporting to you. Approve or reject with an optional note. Approving a Comp-Off request deducts it from that person's ledger (blocked if their balance no longer covers it).</p>,
  },
  {
    id: "leave-entry",
    title: "Leave Entry",
    tag: "leave.manage",
    keywords: "manual leave record backdate",
    body: <p>Record leave on someone's behalf when it didn't come through their own leave request — same types and rules as My Leave apply.</p>,
  },
  {
    id: "wfh-requests",
    title: "WFH Requests",
    tag: "leave.manage or wfh.approve",
    keywords: "work from home approve",
    body: <p>Work-from-home requests awaiting a decision, tabbed Pending / Approved / Rejected.</p>,
  },
  {
    id: "market-visits",
    title: "Market Visits",
    tag: "market_visits.review",
    keywords: "field visit checkin location",
    body: <p>Field/market visit check-ins awaiting review — location, time, and notes for each visit.</p>,
  },
  {
    id: "comp-off-admin",
    title: "Comp-Off",
    tag: "employees.manage or policy.manage",
    keywords: "compensatory off ledger grant",
    body: <p>Manually grant Comp-Off after confirming someone worked a weekly-off or closed/Day-Off holiday (½ day if ≤4 hours worked, full day otherwise). Shows the full ledger — earned, used, expired — per employee.</p>,
  },
  {
    id: "aip",
    title: "AIP (Attendance Improvement Plan)",
    tag: "leave.manage",
    keywords: "attendance monitoring plan warning",
    body: <p>Tracks employees placed on an attendance monitoring period — Active, Passed, or Failed — with the plan's end date and outcome.</p>,
  },
  {
    id: "leave-policy",
    title: "Leave Policy",
    tag: "employees.manage or policy.manage",
    keywords: "holiday calendar comp off birthdays store closed",
    body: (
      <>
        <p>Three tabs:</p>
        <p><strong>Holiday Calendar</strong> — company holidays, which can vary per store. Each entry has a Type:</p>
        <Table
          head={["Type", "Effect"]}
          rows={[
            ["Store closed", "Paid like a weekly-off"],
            ["Day Off", "Same pay treatment as Store closed — a distinct label for a company-granted day off"],
            ["Open (statutory pay)", "Store operates, statutory holiday pay applies"],
            ["Open till a set time", "Shortened schedule"],
            ["Open (no special pay)", "Normal operation"],
            ["Anniversary", "Informational only — no effect on attendance or pay"],
          ]}
        />
        <p>Only Store closed and Day Off count toward Comp-Off if worked (corporate roster only).</p>
        <p><strong>Comp-Off</strong> — same as the standalone Comp-Off page above.</p>
        <p><strong>Birthdays</strong> — upcoming birthdays for the HQ team, soonest first, with a quick way to add/correct a date of birth.</p>
      </>
    ),
  },
  {
    id: "payroll-ot",
    title: "Payroll & OT",
    tag: "payroll.view",
    keywords: "payroll overtime salary run process",
    body: <p>Company-wide payroll figures and overtime calculations for a given pay period — the source data behind every employee's individual payslip.</p>,
  },
  {
    id: "payslip-approvals",
    title: "Payslip Approvals",
    tag: "payslip_approvals.manage",
    keywords: "approve payslip sign off",
    body: <p>Payslips submitted for sign-off (mainly HR's own — see My Payslip) awaiting a decision, tabbed Pending / Approved / Rejected.</p>,
  },
  {
    id: "reports",
    title: "Reports",
    tag: "payroll.view or attendance.restricted_reports",
    keywords: "salary sheet PF ESIC PT LWF TDS bonus gratuity attendance punctuality",
    body: (
      <p>
        A hub of exportable reports — Salary Sheet, Yearly Salary, CTC (as per Salary / as per Payslip), Arrear
        Details, Salary Paid, Full &amp; Final, Accounts JV, Bank Transfer, Head Count, PF, ESIC, PT, LWF, TDS
        Projection, Bonus, Gratuity, Leave Ledger, Lumpsum, Attendance, Punctuality, and Late-Night Safety. Each is
        its own page reachable from this hub.
      </p>
    ),
  },
  {
    id: "loans",
    title: "Loan Requests",
    tag: "loans.manage",
    keywords: "employee loan advance EMI",
    body: <p>Employee-requested loans/advances awaiting approval, and the standing EMI schedule once approved (which then feeds payroll deductions).</p>,
  },
  {
    id: "letters",
    title: "Letters",
    tag: "letters.generate or letters.manage",
    keywords: "offer letter experience letter warning termination template",
    body: (
      <>
        <p>Generate employee letters (offer, experience, warning, termination, etc.) from templates. Pick a letter type and an employee — name, code, designation, department, Date of Joining, and address auto-fill from their record; everything else is typed in and fully editable before generating. Fields like a KRA list or termination reasons accept multiple lines and get auto-formatted as a numbered/bulleted list. Generated letters are printable.</p>
        <p><code className="bg-manila/50 px-1 rounded-sm">letters.manage</code> additionally lets you create/edit the templates; <code className="bg-manila/50 px-1 rounded-sm">letters.generate</code> alone just lets you produce letters from existing ones.</p>
      </>
    ),
  },
  {
    id: "disputes",
    title: "Disputes",
    tag: "disputes.manage",
    keywords: "missed punch clock in out attendance correction",
    body: <p>Where employees' reported missed-punch issues land — they report a day where clock-in or clock-out didn't register, with what they claim the actual time was and why. For each pending one: confirm/adjust the actual times and Approve (corrects their attendance for that day) or Reject with a note. Filter by store location if you only handle certain stores.</p>,
  },
  {
    id: "company-policy-admin",
    title: "Company Policy",
    keywords: "policy document view",
    body: <p>The company policy document, viewable by every console login regardless of permissions.</p>,
  },
  {
    id: "policy-signoff",
    title: "Policy Sign-off",
    tag: "policy.acknowledgements.view",
    keywords: "acknowledgement quiz score register who has read",
    body: <p>A register of who has and hasn't acknowledged the current policy version, with their quiz score if applicable. Bumping the policy version re-prompts everyone to read and acknowledge it again.</p>,
  },
  {
    id: "hr-tasks",
    title: "HR Tasks",
    tag: "HR-team only",
    keywords: "internal task list assign priority",
    body: <p>An internal task tracker for the HR team specifically — Accounts logins don't see this (except the shared "jadehr" account, which is treated as HR for this one feature). Create, assign, and prioritize tasks, with a reporting view.</p>,
  },
  {
    id: "my-leave-payslip-admin",
    title: "My Leave / My Payslip (your own)",
    keywords: "personal own leave payslip hr accounts",
    body: <p>Same as the employee-facing My Leave / My Payslip pages — your own leave balance and requests, and your own payslip (which also needs its own sign-off before it's final).</p>,
  },
  {
    id: "team-access",
    title: "Team Access",
    tag: "permissions.manage",
    keywords: "permissions grant hr role console access",
    body: <p>Controls which permissions each HR-role login has (Accounts logins always have full access and aren't configured here). Toggle a permission on/off per person, or set the HR-role-wide default that applies to anyone without an individual override.</p>,
  },
];

const SECTIONS = [
  { group: "Getting Started", items: GETTING_STARTED, roles: "all" },
  { group: "Employee Self-Service", items: EMPLOYEE_SECTIONS, roles: "all" },
  { group: "Admin Console (HR / Accounts)", items: ADMIN_SECTIONS, roles: "console" },
];

function textOf(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join(" ");
  if (node.props?.children) return textOf(node.props.children);
  return "";
}

export default function Help({ scope }) {
  const { user } = useAuth();
  const isConsole = scope === "admin" || ["hr", "accounts"].includes(user?.role);
  const [query, setQuery] = useState("");
  const [openIds, setOpenIds] = useState(() => new Set());

  const groups = SECTIONS.filter((g) => g.roles === "all" || isConsole);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((item) => {
          const haystack = `${item.title} ${item.keywords || ""} ${textOf(item.body)}`.toLowerCase();
          return haystack.includes(q);
        }),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, q]);

  const toggle = (id, isOpen) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (isOpen) next.add(id); else next.delete(id);
      return next;
    });
  };

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-1">
        <HelpCircle size={22} className="text-jade-600 flex-shrink-0" />
        <h2 className="font-display text-2xl text-ink">Help</h2>
      </div>
      <p className="text-sm text-ink/70 mb-5">
        Everything the JADE HR console does, in one place — what each section is for, and the exact rules behind
        leave, payroll, and onboarding so you can explain a figure with confidence.
      </p>

      <div className="relative mb-6">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search help topics — e.g. “red card”, “onboarding”, “comp-off”…"
          className="w-full rounded-sm border border-ink/15 bg-paper pl-9 pr-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
        />
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-ink/60">No help topics match “{query}”.</p>
      )}

      <div className="space-y-8">
        {filtered.map((g) => (
          <div key={g.group}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2.5">{g.group}</h3>
            <div className="space-y-2.5">
              {g.items.map((item) => (
                <Topic
                  key={item.id}
                  title={item.title}
                  tag={item.tag}
                  keywords={item.keywords}
                  open={q ? true : openIds.has(item.id)}
                  onToggle={(isOpen) => toggle(item.id, isOpen)}
                >
                  {item.body}
                </Topic>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
