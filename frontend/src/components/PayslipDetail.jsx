import { Printer } from "lucide-react";

import DailyAttendanceSection from "./DailyAttendanceSection.jsx";
import LedgerLine from "./LedgerLine.jsx";
import StatCard from "./StatCard.jsx";
import { formatFullDate, formatHoursMins, formatINR, formatPlainAmount, payPeriodLabel } from "../lib/format.js";

const OFFICE_ADDRESS = "101 Raheja Xion, Dr. Ambedkar Road, Byculla (East), Mumbai 400027, India";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// A "Label ····· Value" row with a dotted leader, matching the
// registered-payslip form fields (Name, Designation, Present, etc.).
function InfoRow({ label, value }) {
  const isEmpty = value === undefined || value === null || value === "";
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-dotted border-ink/25 py-1 text-sm">
      <span className="font-semibold text-ink/80 shrink-0">{label}</span>
      <span className="text-ink font-nums text-right truncate">{isEmpty ? "—" : value}</span>
    </div>
  );
}

// Single combined Earnings | Deductions | Description(leave ledger) table —
// mirrors the printed payslip's one-table layout instead of three separate
// cards. Rows with no amount are hidden (PF/ESIC/PT/LWF only apply to some
// employees) except for the core recurring earning lines, which always show.
function PayslipLedgerTable({ earningsRows, deductionsRows, pl, netSalary }) {
  const earnings = earningsRows.filter((r) => r.always || r.value > 0);
  const deductions = deductionsRows.filter((r) => r.value > 0);
  const totalEarnings = earnings.reduce((s, r) => s + (r.value || 0), 0);
  const totalDeductions = deductions.reduce((s, r) => s + (r.value || 0), 0);
  const rowCount = Math.max(earnings.length, deductions.length, pl ? 1 : 0);
  const thCls = "px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-ink/70";

  const descColSpan = 5; // label + Opg + Dr + Cr + Clg
  return (
    <div className="bg-paper rounded-sm shadow-card border border-ink/15 overflow-hidden overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-ink/15">
            <th colSpan={2} className={`${thCls} border-r border-ink/10`}>Earnings</th>
            <th colSpan={2} className={`${thCls} border-r border-ink/10`}>Deductions</th>
            {pl && <th colSpan={descColSpan} className={thCls}>Description</th>}
          </tr>
          <tr className="border-b border-ink/10">
            <th className={thCls}></th>
            <th className={`${thCls} text-right border-r border-ink/10`}>Amount</th>
            <th className={thCls}></th>
            <th className={`${thCls} text-right border-r border-ink/10`}>Amount</th>
            {pl && (
              <>
                <th className={thCls}></th>
                <th className={`${thCls} text-right`}>Opg</th>
                <th className={`${thCls} text-right`}>Dr</th>
                <th className={`${thCls} text-right`}>Cr</th>
                <th className={`${thCls} text-right`}>Clg</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, i) => {
            const e = earnings[i];
            const d = deductions[i];
            return (
              <tr key={i} className="border-b border-dotted border-ink/[0.12]">
                <td className="px-3 py-1.5 text-ink/80">{e?.label || ""}</td>
                <td className="px-3 py-1.5 text-right font-nums text-ink border-r border-ink/10">
                  {e ? formatINR(e.value) : ""}
                </td>
                <td className="px-3 py-1.5 text-ink/80">{d?.label || ""}</td>
                <td className={`px-3 py-1.5 text-right font-nums text-ink ${pl ? "border-r border-ink/10" : ""}`}>
                  {d ? formatINR(d.value) : ""}
                </td>
                {pl && i === 0 && (
                  <>
                    <td className="px-3 py-1.5 text-ink/80">{pl.label || "PL"}</td>
                    <td className="px-3 py-1.5 text-right font-nums text-ink">{pl.opening}</td>
                    <td className="px-3 py-1.5 text-right font-nums text-ink">{pl.debit}</td>
                    <td className="px-3 py-1.5 text-right font-nums text-ink">{pl.credit}</td>
                    <td className="px-3 py-1.5 text-right font-nums text-ink">{pl.closing}</td>
                  </>
                )}
                {pl && i !== 0 && <td colSpan={descColSpan}></td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-ink/15 font-semibold">
            <td className="px-3 py-2">Total :</td>
            <td className="px-3 py-2 text-right font-nums border-r border-ink/10">{formatINR(totalEarnings)}</td>
            <td className="px-3 py-2">Total :</td>
            <td className={`px-3 py-2 text-right font-nums text-rust-500 ${pl ? "border-r border-ink/10" : ""}`}>
              {formatINR(totalDeductions)}
            </td>
            {pl && <td colSpan={descColSpan}></td>}
          </tr>
          <tr className="bg-ledger-800">
            <td colSpan={pl ? 4 + descColSpan : 4} className="px-3 py-2.5 relative">
              <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
              <div className="relative flex justify-between items-baseline">
                <span className="font-display text-manila text-base">Net Salary</span>
                <span className="font-nums font-semibold text-xl text-manila">{formatINR(netSalary)}</span>
              </div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// A plain bordered-table cell — the print format's atomic unit, standing in
// for the dotted-leader/card styling used everywhere else in the app. Print
// output needs to read as an official payroll form, not a product screen.
// whitespace-nowrap on every cell (not just labels) matters more than it
// looks: without it, a narrow print viewport (mobile "Save as PDF" renders
// print media at the device's own width, not a fixed page size) wraps
// short values like "Designation" or a PAN number mid-word instead of
// just letting the column widen.
//
// Border/fill are solid colors, not Tailwind's opacity utilities
// (border-ink/50, bg-manila/60) -- opacity means alpha-compositing per
// pixel, and at a collapsed-table edge two adjacent cells' semi-transparent
// borders overlap and get composited again, which some print/PDF
// rasterizers (mobile Safari's "Save as PDF" in particular) render as a
// fine moire/hatch pattern instead of one clean line. #8c8c89/#f5f2e9 are
// just border-ink/50 and bg-manila/60 pre-flattened against a white page,
// so this looks identical to before, just with nothing left for a
// rasterizer to mis-composite.
const cellCls = "border border-[#9aa9a4] px-2.5 py-1.5 whitespace-nowrap";
const labelCls = `${cellCls} font-semibold bg-[#e8efec] text-[#16302A]`;

// The Earnings/Deductions/Description ledger table can run to 10 columns
// (with a PL ledger) — at that width, cellCls's whitespace-nowrap on every
// cell pushed the table's natural content width past the 186mm print page,
// clipping the rightmost column(s) off the printed/PDF'd page. table-fixed
// + explicit per-column widths keeps it within the page regardless of
// content; dropping whitespace-nowrap here lets a cell wrap instead of
// bleeding off the edge in the rare case content doesn't fit its column.
const ledgerCellCls = "border border-[#9aa9a4] px-1.5 py-1.5 text-[11px] break-words";
const ledgerLabelCls = `${ledgerCellCls} font-semibold bg-[#e8efec] text-[#16302A]`;

// Indian-grouped amount for the printed form: 1,23,456.00
const money = (v) =>
  (v || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
// Days: "22" for whole numbers, "22.5" otherwise.
const days = (v) => (Number.isInteger(v || 0) ? String(v || 0) : String(v));

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven",
  "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function below1000(n) {
  const parts = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : "")); }
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(" ");
}
// Indian system: Crore / Lakh / Thousand.
function rupeesInWords(amount) {
  let r = Math.round(Math.abs(amount || 0));
  if (r === 0) return "Zero Rupees Only";
  const out = [];
  for (const [div, name] of [[10000000, "Crore"], [100000, "Lakh"], [1000, "Thousand"]]) {
    if (r >= div) { out.push(`${below1000(Math.floor(r / div))} ${name}`); r %= div; }
  }
  if (r > 0) out.push(below1000(r));
  return `${out.join(" ")} Rupees Only`;
}

// Exact replica of the company's official payslip content -- the only thing
// that should render when a payslip is printed/saved as PDF (hidden on
// screen, shown via print:block). Layout is deliberately simple: letterhead,
// employee block, attendance strip, one earnings|deductions table, leave
// ledger, net-pay band. Solid colors only (see cellCls note above).
function PayslipPrintFormat({ summary }) {
  const earningsRows = [
    { label: "Basic", rate: summary.basic_rate, value: summary.basic, always: true },
    { label: "HRA", rate: summary.hra_rate, value: summary.hra, always: true },
    { label: "Conveyance", rate: summary.conveyance_rate, value: summary.conveyance, always: true },
    { label: "Other Allowance", rate: summary.other_allowance_rate, value: summary.other_allowance, always: true },
    { label: "Monthly Bonus", rate: summary.monthly_bonus_rate, value: summary.monthly_bonus },
    { label: "Retention", rate: summary.retention_rate, value: summary.retention },
    { label: "Incentive", rate: summary.incentive_rate, value: summary.incentive },
    { label: "OT Amount", rate: null, value: summary.ot_amount },
    { label: "Arrear", rate: null, value: summary.arrear_in_net ? summary.arrear : 0 },
  ].filter((r) => r.always || r.value > 0);

  const deductionsRows = [
    { label: "Provident Fund (PF)", value: summary.ded_pf },
    { label: "ESIC", value: summary.ded_esic },
    { label: "Professional Tax (PT)", value: summary.ded_pt },
    { label: "Labour Welfare Fund (LWF)", value: summary.ded_lwf },
    { label: "TDS", value: summary.ded_tds },
    { label: "Loan EMI", value: summary.ded_standing_loan },
    { label: "TDS on Arrear", value: summary.arrear_in_net ? summary.arrear_tds : 0 },
  ].filter((r) => r.value > 0);

  const pl = summary.pl_ledger;
  const totalMonthly = earningsRows.reduce((s, r) => s + (r.rate || 0), 0);
  const totalEarned = earningsRows.reduce((s, r) => s + (r.value || 0), 0);
  const totalDeductions = deductionsRows.reduce((s, r) => s + (r.value || 0), 0);
  const rowCount = Math.max(earningsRows.length, deductionsRows.length);

  const th = "bg-[#16302A] text-white text-[10.5px] font-semibold uppercase tracking-wider px-2.5 py-1.5";
  const td = "px-2.5 py-1.5 border-b border-[#dfe6e3]";
  const num = "text-right font-nums";
  const Field = ({ label, value }) => (
    <div className="flex justify-between gap-3 py-[5px] border-b border-[#dfe6e3]">
      <span className="text-[#5f6f6a] text-[11px]">{label}</span>
      <span className="font-semibold text-[11.5px] text-right">{value || "—"}</span>
    </div>
  );
  const Stat = ({ label, value, warn }) => (
    <div className="flex-1 text-center py-2 border-r border-[#c9d5d1] last:border-r-0">
      <div className="text-[9.5px] uppercase tracking-wider text-[#5f6f6a]">{label}</div>
      <div className={`text-[15px] font-semibold font-nums mt-0.5 ${warn ? "text-[#b4452f]" : "text-[#16302A]"}`}>{value}</div>
    </div>
  );

  return (
    <div className="payslip-print-page hidden print:block text-ink text-[12px] leading-normal font-sans">
      <div className="flex items-center justify-between gap-6 pb-3 border-b-[3px] border-[#16302A]">
        <img src="/jade-letterhead-logo.png" alt="JADE" className="h-[56px] w-auto" />
        <div className="text-right">
          <p className="font-display text-[17px] tracking-wide text-[#16302A]">JADE Lifestyle India</p>
          <p className="text-[#5f5f5d] text-[10.5px] mt-1 max-w-[95mm] leading-snug ml-auto">{OFFICE_ADDRESS}</p>
        </div>
      </div>
      <div className="bg-[#16302A] text-white text-center py-1.5 mb-4 text-[12.5px] font-semibold tracking-[0.18em] uppercase">
        Payslip for {MONTH_NAMES[summary.month - 1]} {summary.year}
      </div>

      {/* Employee block */}
      <div className="flex items-end justify-between mb-1.5">
        <p className="text-[15px] font-semibold text-[#16302A]">{summary.name}</p>
        <p className="text-[11px] text-[#5f6f6a]">Employee Code: <span className="font-semibold text-ink">{summary.employee_code}</span></p>
      </div>
      <div className="grid grid-cols-2 gap-x-12 mb-4 border-t-2 border-[#16302A]">
        <div>
          <Field label="Designation" value={summary.designation} />
          <Field label="Department" value={summary.department} />
          <Field label="Location" value={summary.location} />
          <Field label="Date of Joining" value={formatFullDate(summary.date_of_joining)} />
          <Field label="Payment Mode" value={summary.payment_mode} />
        </div>
        <div>
          <Field label="PAN No" value={summary.pan_no} />
          <Field label="UAN No" value={summary.uan_no} />
          <Field label="PF No" value={summary.pf_no} />
          <Field label="ESIC No" value={summary.esic_no} />
          <Field label="Aadhar No" value={summary.aadhar_no} />
        </div>
      </div>

      {/* Attendance strip */}
      <div className="flex mb-4 border border-[#c9d5d1] bg-[#f1f5f3]">
        <Stat label="Present" value={days(summary.present_days)} />
        <Stat label="Weekly Off" value={days(summary.weekoff_days)} />
        <Stat label="Holidays" value={days(summary.holiday_days)} />
        <Stat label="Leave Adj." value={days(summary.pl_days)} />
        <Stat label="Paid Days" value={days(summary.paid_days)} />
        <Stat label="Without Pay" value={days(summary.without_pay_days)} warn={summary.without_pay_days > 0} />
        <Stat label="Total Days" value={days(summary.days_in_month)} />
      </div>

      {/* Earnings | Deductions */}
      <table className="w-full border-collapse table-fixed border border-[#c9d5d1]">
        <colgroup>
          <col style={{ width: "21%" }} /><col style={{ width: "15%" }} /><col style={{ width: "15%" }} />
          <col style={{ width: "28%" }} /><col style={{ width: "21%" }} />
        </colgroup>
        <thead>
          <tr>
            <th className={`${th} text-left`}>Earnings</th>
            <th className={`${th} text-right`}>Monthly (₹)</th>
            <th className={`${th} text-right border-r-2 border-white`}>Earned (₹)</th>
            <th className={`${th} text-left`}>Deductions</th>
            <th className={`${th} text-right`}>Amount (₹)</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, i) => {
            const e = earningsRows[i];
            const d = deductionsRows[i];
            return (
              <tr key={i}>
                <td className={td}>{e?.label || " "}</td>
                <td className={`${td} ${num} text-[#5f6f6a]`}>{e?.rate ? money(e.rate) : ""}</td>
                <td className={`${td} ${num} border-r border-[#c9d5d1]`}>{e ? money(e.value) : ""}</td>
                <td className={td}>{d?.label || ""}</td>
                <td className={`${td} ${num}`}>{d ? money(d.value) : ""}</td>
              </tr>
            );
          })}
          <tr className="font-semibold bg-[#e8efec] text-[#16302A]">
            <td className="px-2.5 py-2">Total</td>
            <td className={`px-2.5 py-2 ${num}`}>{money(totalMonthly)}</td>
            <td className={`px-2.5 py-2 ${num} border-r border-[#c9d5d1]`}>{money(totalEarned)}</td>
            <td className="px-2.5 py-2">Total Deductions</td>
            <td className={`px-2.5 py-2 ${num}`}>{money(totalDeductions)}</td>
          </tr>
        </tbody>
      </table>

      {/* Net pay */}
      <div className="mt-3 bg-[#16302A] text-white px-4 py-2.5 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] opacity-80">Net Salary Payable</p>
          <p className="text-[10.5px] mt-0.5 italic">{rupeesInWords(summary.total_payable)}</p>
        </div>
        <p className="text-[20px] font-semibold font-nums">₹ {money(summary.total_payable)}</p>
      </div>

      {/* Leave ledger */}
      {pl && (
        <table className="mt-4 border-collapse border border-[#c9d5d1] text-[11px]" style={{ width: "62%" }}>
          <thead>
            <tr>
              <th className={`${th} text-left`}>Leave Ledger</th>
              <th className={`${th} text-right`}>Opening</th>
              <th className={`${th} text-right`}>Debit</th>
              <th className={`${th} text-right`}>Credit</th>
              <th className={`${th} text-right`}>Closing</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className={td}>Paid Leave (PL)</td>
              <td className={`${td} ${num}`}>{money(pl.opening)}</td>
              <td className={`${td} ${num}`}>{money(pl.debit)}</td>
              <td className={`${td} ${num}`}>{money(pl.credit)}</td>
              <td className={`${td} ${num} font-semibold`}>{money(pl.closing)}</td>
            </tr>
          </tbody>
        </table>
      )}

      <p className="text-center text-[#5f6f6a] text-[10px] mt-8 pt-3 border-t-2 border-[#16302A]">
        This is a computer-generated payslip and does not require a signature.
      </p>
    </div>
  );
}

// One half of the on-screen statement: a plain list of lines with a total, readable at any width.
function StatementCard({ title, rows, total, negative, empty }) {
  return (
    <div className="bg-paper rounded-sm shadow-card border border-ink/15 overflow-hidden">
      <p className="px-5 pt-4 pb-2 text-[11px] font-semibold uppercase tracking-wider text-ink/70">{title}</p>
      <div className="px-5">
        {rows.length === 0 && <p className="py-3 text-sm text-ink/60">{empty || "Nothing"}</p>}
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-4 py-2 border-b border-dotted border-ink/15 text-sm">
            <span className="text-ink/80 min-w-0">{r.label}</span>
            <span className="font-nums text-ink whitespace-nowrap">{formatINR(r.value)}</span>
          </div>
        ))}
      </div>
      <div className="flex items-baseline justify-between gap-4 px-5 py-3 mt-1 bg-ink/[0.04] font-semibold text-sm">
        <span>Total {title.toLowerCase()}</span>
        <span className={`font-nums whitespace-nowrap ${negative && total > 0 ? "text-rust-500" : "text-ink"}`}>{formatINR(total)}</span>
      </div>
    </div>
  );
}

export default function PayslipDetail({ summary, showDailyAttendance = true, selfService = false }) {
  if (!summary) return null;

  // The OT panel's divisor always uses the full monthly rate, not the
  // attendance-prorated Basic/HRA/Conveyance shown in the Earnings ledger
  // below — an hour of OT is worth the same regardless of days missed.
  const gross = summary.basic_rate + summary.hra_rate + summary.conveyance_rate;

  const earningsRows = [
    { label: "Basic", value: summary.basic, always: true },
    { label: "HRA", value: summary.hra, always: true },
    { label: "Conveyance", value: summary.conveyance, always: true },
    { label: "Other Allowance", value: summary.other_allowance, always: true },
    { label: "Monthly Bonus", value: summary.monthly_bonus, always: true },
    { label: "Retention", value: summary.retention, always: true },
    { label: "Incentive", value: summary.incentive, always: true },
    { label: "OT Amount", value: summary.ot_amount, always: true },
    ...(summary.arrear_in_net ? [{ label: "Arrear", value: summary.arrear, always: true }] : []),
  ];

  const deductionsRows = [
    { label: "PF (employee contribution)", value: summary.ded_pf },
    { label: "ESIC (employee contribution)", value: summary.ded_esic },
    { label: "PT (Professional Tax)", value: summary.ded_pt },
    { label: "LWF (Labour Welfare Fund)", value: summary.ded_lwf },
    { label: "TDS (Income Tax)", value: summary.ded_tds },
    ...(summary.arrear_in_net && summary.arrear_tds > 0 ? [{ label: "TDS on Arrear", value: summary.arrear_tds }] : []),
  ];

  const pl = summary.pl_ledger;

  return (
    <div className="space-y-6 print-area">
      <div className="flex justify-end no-print">
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-1.5 rounded-sm text-xs font-semibold hover:border-jade-500 transition-colors"
        >
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>

      <PayslipPrintFormat summary={summary} />

      <div className="print:hidden space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pb-4 border-b border-ink/10 rise-in">
          <div className="min-w-0">
            <p className="font-display text-ink text-xl leading-tight">Payslip for {MONTH_NAMES[summary.month - 1]} {summary.year}</p>
            <p className="text-ink/70 text-xs font-nums mt-1">{payPeriodLabel(summary.year, summary.month)}</p>
          </div>
          <div className="min-w-0 sm:text-right">
            <p className="font-display text-ink text-base leading-none">JADE by MK</p>
            <p className="text-ink/60 text-[11px] mt-1 leading-snug max-w-[280px] sm:ml-auto">{OFFICE_ADDRESS}</p>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-sm bg-ledger-800 px-5 py-5 sm:px-7">
          <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
          <div className="relative flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-manila/70">Net salary payable</p>
              <p className="font-nums font-semibold text-3xl sm:text-4xl text-manila mt-1">{formatINR(summary.total_payable)}</p>
            </div>
            <p className="text-xs text-manila/80 font-nums">{summary.paid_days} paid days of {summary.days_in_month}{summary.without_pay_days > 0 ? ` · ${summary.without_pay_days} without pay` : ""}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          <StatementCard title="Earnings" rows={earningsRows.filter((r) => r.always || r.value > 0)} total={earningsRows.filter((r) => r.always || r.value > 0).reduce((t, r) => t + (r.value || 0), 0)} />
          <StatementCard title="Deductions" rows={deductionsRows.filter((r) => r.value > 0)} negative empty="No deductions this month" total={deductionsRows.filter((r) => r.value > 0).reduce((t, r) => t + (r.value || 0), 0)} />
        </div>

        {pl && (
          <div className="bg-paper rounded-sm shadow-card border border-ink/15 px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70 mb-2">Paid leave ledger</p>
            <div className="grid grid-cols-4 gap-3 text-center">
              {[["Opening", pl.opening], ["Debit", pl.debit], ["Credit", pl.credit], ["Closing", pl.closing]].map(([k, v]) => (
                <div key={k}><p className="text-[10px] uppercase tracking-wider text-ink/60">{k}</p><p className="font-nums text-ink text-base mt-0.5">{v}</p></div>
              ))}
            </div>
          </div>
        )}

        <div className="bg-paper rounded-sm shadow-card border border-ink/15 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70 mb-3">Attendance this period</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
            {[
              ["Present", summary.present_days], ["Weekly off", summary.weekoff_days], ["Holiday", summary.holiday_days], ["Leave", summary.pl_days],
              ["Paid days", summary.paid_days], ["Without pay", summary.without_pay_days, summary.without_pay_days > 0], ["Total days", summary.days_in_month],
              ["Hours worked", formatHoursMins(summary.total_hours_worked)], ["OT hours", formatHoursMins(summary.total_ot_hours)],
            ].map(([k, v, warn]) => (
              <div key={k} className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-ink/60">{k}</p>
                <p className={`font-nums text-base mt-0.5 ${warn ? "text-rust-500" : "text-ink"}`}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-paper rounded-sm shadow-card border border-ink/15 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70 mb-2">Employee details</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-10">
            <div>
              <InfoRow label="Name" value={`${summary.name} [${summary.employee_code}]`} />
              <InfoRow label="Designation" value={summary.designation} />
              <InfoRow label="Department" value={summary.department} />
              <InfoRow label="Location" value={summary.location} />
              <InfoRow label="Date of Join" value={formatFullDate(summary.date_of_joining)} />
              <InfoRow label="Payment Mode" value={summary.payment_mode} />
            </div>
            <div>
              <InfoRow label="PAN No" value={summary.pan_no} />
              <InfoRow label="UAN No" value={summary.uan_no} />
              <InfoRow label="Aadhar No" value={summary.aadhar_no} />
              <InfoRow label="PF No" value={summary.pf_no} />
              <InfoRow label="ESIC No" value={summary.esic_no} />
            </div>
          </div>
        </div>

        <details className="bg-paper rounded-sm shadow-card border border-ink/15 group">
          <summary className="cursor-pointer select-none px-5 py-4 text-[11px] font-semibold uppercase tracking-wider text-ochre-700 flex items-center justify-between">
            <span>Overtime calculation</span>
            <span className="font-nums normal-case tracking-normal text-ink/70 text-sm">{formatINR(summary.ot_amount)} · {formatHoursMins(summary.total_ot_hours)}</span>
          </summary>
          <div className="px-5 pb-5">
            <p className="text-xs text-ink/65 mb-3 font-nums">(Basic + HRA + Conveyance) &divide; days in month &divide; standard hours &times; OT hours</p>
            <LedgerLine label="Basic" value={formatINR(summary.basic_rate)} />
            <LedgerLine label="HRA" value={formatINR(summary.hra_rate)} />
            <LedgerLine label="Conveyance" value={formatINR(summary.conveyance_rate)} />
            <LedgerLine label="Total salary" value={formatINR(gross)} strong />
            <div className="mt-3">
              <LedgerLine label="Per day salary" sub={`${formatINR(gross)} ÷ ${summary.days_in_month} days`} value={formatINR(summary.per_day_salary)} />
              <LedgerLine label="Per hour salary" sub="per day ÷ standard hours" value={formatINR(summary.per_hour_salary)} />
              <LedgerLine label="Total OT hours" value={formatHoursMins(summary.total_ot_hours)} />
              <LedgerLine label="OT amount" value={formatINR(summary.ot_amount)} strong accent="text-ochre-700" />
            </div>
          </div>
        </details>
      </div>

      {showDailyAttendance && (
        <DailyAttendanceSection
          monthDaily={summary.daily}
          employeeId={summary.employee_id}
          employeeCode={summary.employee_code}
          name={summary.name}
          rangeLabel={payPeriodLabel(summary.year, summary.month)}
          selfService={selfService}
        />
      )}
    </div>
  );
}
