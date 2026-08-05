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
const cellCls = "border border-ink/50 px-2.5 py-1.5 whitespace-nowrap";
const labelCls = `${cellCls} font-semibold bg-manila/60`;

// Exact replica of the company's official (pre-existing, Zoho-derived)
// payslip form — the only thing that should render when a payslip is
// printed/saved as PDF. Kept as one self-contained block (hidden on screen,
// shown only via the print:block/print:hidden split below) rather than
// restyling the on-screen dashboard view, since the two have genuinely
// different jobs: the dashboard view is for reviewing figures on screen
// (OT breakdown, daily attendance, stat cards), this is the one artifact
// that leaves the system and has to match the paper form employees already
// recognize.
function PayslipPrintFormat({ summary }) {
  const earningsRows = [
    { label: "Basic", rate: summary.basic_rate, value: summary.basic, always: true },
    { label: "HRA", rate: summary.hra_rate, value: summary.hra, always: true },
    { label: "Conveyance", rate: summary.conveyance_rate, value: summary.conveyance, always: true },
    { label: "Other Allow", rate: summary.other_allowance_rate, value: summary.other_allowance, always: true },
    { label: "Monthly Bonus", rate: summary.monthly_bonus_rate, value: summary.monthly_bonus },
    { label: "Retention", rate: summary.retention_rate, value: summary.retention },
    { label: "Incentive", rate: summary.incentive_rate, value: summary.incentive },
    { label: "OT Amount", rate: null, value: summary.ot_amount },
  ].filter((r) => r.always || r.value > 0);

  const deductionsRows = [
    { label: "PF", value: summary.ded_pf },
    { label: "ESIC", value: summary.ded_esic },
    { label: "PT", value: summary.ded_pt },
    { label: "LWF", value: summary.ded_lwf },
    { label: "TDS", value: summary.ded_tds },
    { label: "Loan EMI", value: summary.ded_standing_loan },
  ].filter((r) => r.value > 0);

  const pl = summary.pl_ledger;
  const totalMonthly = earningsRows.reduce((s, r) => s + (r.rate || 0), 0);
  const totalEarned = earningsRows.reduce((s, r) => s + (r.value || 0), 0);
  const totalDeductions = deductionsRows.reduce((s, r) => s + (r.value || 0), 0);
  const rowCount = Math.max(earningsRows.length, deductionsRows.length, pl ? 1 : 0);

  return (
    <div className="payslip-print-page hidden print:block text-ink text-[12px] leading-normal font-sans">
      <div className="text-center mb-5 pb-3 border-b-2 border-ink/70">
        <p className="font-display text-base tracking-wide">JADE by MK</p>
        <p className="text-ink/75 text-[11px] mt-1">{OFFICE_ADDRESS.replace(", India", ". India")}</p>
        <p className="font-semibold text-sm mt-3">Payslip for the Month {MONTH_NAMES[summary.month - 1]} {summary.year}</p>
      </div>

      <table className="w-full border-collapse mb-3">
        <tbody>
          <tr>
            <td colSpan={4} className={`${cellCls} font-semibold`}>
              Name {summary.name} [ {summary.employee_code} ]
            </td>
          </tr>
          <tr>
            <td className={labelCls}>Designation</td>
            <td className={cellCls}>{summary.designation || "—"}</td>
            <td className={labelCls}>P F No</td>
            <td className={cellCls}>{summary.pf_no || "—"}</td>
          </tr>
          <tr>
            <td className={labelCls}>Department</td>
            <td className={cellCls}>{summary.department || "—"}</td>
            <td className={labelCls}>ESIC No</td>
            <td className={cellCls}>{summary.esic_no || "—"}</td>
          </tr>
          <tr>
            <td className={labelCls}>P A N No</td>
            <td className={cellCls}>{summary.pan_no || "—"}</td>
            <td className={labelCls}>Date of Join</td>
            <td className={cellCls}>{formatFullDate(summary.date_of_joining)}</td>
          </tr>
          <tr>
            <td className={labelCls}>UAN No</td>
            <td className={cellCls}>{summary.uan_no || "—"}</td>
            <td className={labelCls}>Location</td>
            <td className={cellCls}>{summary.location || "—"}</td>
          </tr>
          <tr>
            <td className={labelCls}>Payment Mode</td>
            <td className={cellCls}>{summary.payment_mode || "—"}</td>
            <td className={labelCls} rowSpan={2}></td>
            <td className={cellCls} rowSpan={2}></td>
          </tr>
          <tr>
            <td className={labelCls}>Aadhar No</td>
            <td className={cellCls}>{summary.aadhar_no || "—"}</td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse mb-3">
        <thead>
          <tr>
            <th className={labelCls}>Present</th>
            <th className={labelCls}>WeeklyOff</th>
            <th className={labelCls}>Holiday</th>
            <th className={labelCls}>LeaveAdj</th>
            <th className={labelCls}>PaidDays</th>
            <th className={labelCls}>WithoutPayDays</th>
            <th className={labelCls}>Total Days</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(summary.present_days)}</td>
            <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(summary.weekoff_days)}</td>
            <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(summary.holiday_days)}</td>
            <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(summary.pl_days)}</td>
            <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(summary.paid_days)}</td>
            <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(summary.without_pay_days)}</td>
            <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(summary.days_in_month)}</td>
          </tr>
        </tbody>
      </table>

      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={labelCls}>Earnings</th>
            <th className={labelCls}>Monthly</th>
            <th className={labelCls}>Amount</th>
            <th className={labelCls}>Deductions</th>
            <th className={labelCls}>Amount</th>
            {pl && (
              <>
                <th className={labelCls}>Description</th>
                <th className={labelCls}>Opg</th>
                <th className={labelCls}>Dr</th>
                <th className={labelCls}>Cr</th>
                <th className={labelCls}>Clg</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rowCount }).map((_, i) => {
            const e = earningsRows[i];
            const d = deductionsRows[i];
            return (
              <tr key={i}>
                <td className={cellCls}>{e?.label || ""}</td>
                <td className={`${cellCls} text-right font-nums`}>{e?.rate ? formatPlainAmount(e.rate) : ""}</td>
                <td className={`${cellCls} text-right font-nums`}>{e ? formatPlainAmount(e.value) : ""}</td>
                <td className={cellCls}>{d?.label || ""}</td>
                <td className={`${cellCls} text-right font-nums`}>{d ? formatPlainAmount(d.value) : ""}</td>
                {pl && i === 0 && (
                  <>
                    <td className={cellCls}>PL</td>
                    <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(pl.opening)}</td>
                    <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(pl.debit)}</td>
                    <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(pl.credit)}</td>
                    <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(pl.closing)}</td>
                  </>
                )}
                {pl && i !== 0 && <td className={cellCls} colSpan={4}></td>}
              </tr>
            );
          })}
          <tr className="font-semibold bg-manila/60">
            <td className={cellCls}>Total :</td>
            <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(totalMonthly)}</td>
            <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(totalEarned)}</td>
            <td className={cellCls}>Total :</td>
            <td className={`${cellCls} text-right font-nums`}>{formatPlainAmount(totalDeductions)}</td>
            <td className={`${cellCls} text-jade-700`} colSpan={pl ? 4 : 1}>
              Net Salary : {formatPlainAmount(summary.total_payable)}
            </td>
          </tr>
        </tbody>
      </table>

      <p className="text-center text-ink/60 text-[10px] mt-5 pt-3 border-t border-ink/25">
        Computer generated payslip, signature
      </p>
    </div>
  );
}

export default function PayslipDetail({ summary, showDailyAttendance = true }) {
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
  ];

  const deductionsRows = [
    { label: "PF (employee contribution)", value: summary.ded_pf },
    { label: "ESIC (employee contribution)", value: summary.ded_esic },
    { label: "PT (Professional Tax)", value: summary.ded_pt },
    { label: "LWF (Labour Welfare Fund)", value: summary.ded_lwf },
    { label: "TDS (Income Tax)", value: summary.ded_tds },
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

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 pb-5 border-b-2 border-ink/10 rise-in print:hidden">
        <div>
          <p className="font-display text-ink text-xl leading-none">JADE by MK</p>
          <p className="text-ink/70 text-xs mt-2 max-w-[260px] leading-snug">{OFFICE_ADDRESS}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-ink text-lg leading-none">Payslip for the Month {MONTH_NAMES[summary.month - 1]} {summary.year}</p>
          <p className="text-ink/70 text-xs font-nums mt-1.5">{payPeriodLabel(summary.year, summary.month)}</p>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card border border-ink/15 p-6 print:hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10">
          <div className="space-y-0.5">
            <InfoRow label="Name" value={`${summary.name} [${summary.employee_code}]`} />
            <InfoRow label="Designation" value={summary.designation} />
            <InfoRow label="Department" value={summary.department} />
            <InfoRow label="Location" value={summary.location} />
            <InfoRow label="P A N No" value={summary.pan_no} />
            <InfoRow label="UAN No" value={summary.uan_no} />
            <InfoRow label="Aadhar No" value={summary.aadhar_no} />
            <InfoRow label="P F No" value={summary.pf_no} />
            <InfoRow label="ESIC No" value={summary.esic_no} />
            <InfoRow label="Date of Join" value={formatFullDate(summary.date_of_joining)} />
            <InfoRow label="Payment Mode" value={summary.payment_mode} />
          </div>
          <div className="space-y-0.5 mt-4 lg:mt-0">
            <InfoRow label="Present" value={summary.present_days} />
            <InfoRow label="WeeklyOff" value={summary.weekoff_days} />
            <InfoRow label="Holiday" value={summary.holiday_days} />
            <InfoRow label="LeaveAdj" value={summary.pl_days} />
            <InfoRow label="PaidDays" value={summary.paid_days} />
            <InfoRow
              label="WithoutPayDays"
              value={<span className={summary.without_pay_days > 0 ? "text-rust-500" : undefined}>{summary.without_pay_days}</span>}
            />
            <InfoRow label="Total Days" value={summary.days_in_month} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 stagger-rise print-hide">
        <StatCard label="Hours Worked" value={formatHoursMins(summary.total_hours_worked)} />
        <StatCard label="OT Hours" value={formatHoursMins(summary.total_ot_hours)} accent="text-ochre-700" />
        <StatCard label="OT Amount" value={formatINR(summary.ot_amount)} accent="text-ochre-700" />
      </div>

      <div className="bg-paper rounded-sm shadow-card p-7 border-t-4 border-ochre-500 print-hide">
        <p className="text-xs font-semibold uppercase tracking-wider text-ochre-700 mb-1">Overtime calculation</p>
        <p className="text-xs text-ink/65 mb-4 font-nums">
          (Basic + HRA + Conveyance) &divide; days in month &divide; standard hours &times; OT hours
        </p>
        <div>
          <LedgerLine label="Basic" value={formatINR(summary.basic_rate)} />
          <LedgerLine label="HRA" value={formatINR(summary.hra_rate)} />
          <LedgerLine label="Conveyance" value={formatINR(summary.conveyance_rate)} />
          <LedgerLine label="Total salary" value={formatINR(gross)} strong />
        </div>
        <div className="mt-3">
          <LedgerLine
            label="Per day salary"
            sub={`${formatINR(gross)} ÷ ${summary.days_in_month} days`}
            value={formatINR(summary.per_day_salary)}
          />
          <LedgerLine
            label="Per hour salary"
            sub="per day ÷ standard hours"
            value={formatINR(summary.per_hour_salary)}
          />
          <LedgerLine label="Total OT hours" value={formatHoursMins(summary.total_ot_hours)} />
          <LedgerLine label="OT amount" value={formatINR(summary.ot_amount)} strong accent="text-ochre-700" />
        </div>
      </div>

      <div className="print:hidden">
        <PayslipLedgerTable
          earningsRows={earningsRows}
          deductionsRows={deductionsRows}
          pl={pl ? { label: "PL", ...pl } : null}
          netSalary={summary.total_payable}
        />
      </div>

      {showDailyAttendance && (
        <DailyAttendanceSection
          monthDaily={summary.daily}
          employeeId={summary.employee_id}
          employeeCode={summary.employee_code}
          name={summary.name}
          rangeLabel={payPeriodLabel(summary.year, summary.month)}
        />
      )}
    </div>
  );
}
