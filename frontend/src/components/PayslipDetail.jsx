import { Printer } from "lucide-react";

import LedgerLine from "./LedgerLine.jsx";
import StampBadge from "./StampBadge.jsx";
import StatCard from "./StatCard.jsx";
import { formatDate, formatFullDate, formatHoursMins, formatINR, formatTime, payPeriodLabel } from "../lib/format.js";

const OFFICE_ADDRESS = "101 Raheja Xion, Dr. Ambedkar Road, Byculla (East), Mumbai 400027, India";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">{label}</p>
      <p className="text-sm text-ink font-medium mt-0.5">{value || "—"}</p>
    </div>
  );
}

// Description/Amount ledger table shared by the Earnings and Deductions
// panels — mirrors the printed payslip's two-column layout. Rows with no
// amount are hidden (matches how PF/ESIC/PT/LWF only apply to some
// employees) except for the core recurring earning lines, which always show.
function LedgerTable({ title, rows, totalLabel, total, accentClass }) {
  const visible = rows.filter((r) => r.always || r.value > 0);
  return (
    <div className="bg-paper rounded-sm shadow-card overflow-hidden">
      <p className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-ink/70">{title}</p>
      <table className="w-full text-sm">
        <tbody>
          {visible.map((r) => (
            <tr key={r.label} className="border-t border-ink/[0.06]">
              <td className="px-5 py-2 text-ink/80">{r.label}</td>
              <td className="px-5 py-2 text-right font-nums text-ink">{formatINR(r.value)}</td>
            </tr>
          ))}
          <tr className={`border-t-2 border-ink/10 font-semibold ${accentClass || "text-ink"}`}>
            <td className="px-5 py-2.5">{totalLabel}</td>
            <td className="px-5 py-2.5 text-right font-nums">{formatINR(total)}</td>
          </tr>
        </tbody>
      </table>
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
  const totalEarnings = earningsRows.reduce((s, r) => s + (r.value || 0), 0);

  const deductionsRows = [
    { label: "PF (employee contribution)", value: summary.ded_pf },
    { label: "ESIC (employee contribution)", value: summary.ded_esic },
    { label: "PT (Professional Tax)", value: summary.ded_pt },
    { label: "LWF (Labour Welfare Fund)", value: summary.ded_lwf },
    { label: "TDS (Income Tax)", value: summary.ded_tds },
  ];
  const totalDeductions = deductionsRows.reduce((s, r) => s + (r.value || 0), 0);

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

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 pb-5 border-b-2 border-ink/10 rise-in">
        <div>
          <p className="font-display text-ink text-xl leading-none">JADE by MK</p>
          <p className="text-ink/70 text-xs mt-2 max-w-[260px] leading-snug">{OFFICE_ADDRESS}</p>
        </div>
        <div className="text-right">
          <p className="font-display text-ink text-lg leading-none">Payslip for the Month {MONTH_NAMES[summary.month - 1]} {summary.year}</p>
          <p className="text-ink/70 text-xs font-nums mt-1.5">{payPeriodLabel(summary.year, summary.month)}</p>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4">
          <InfoField label="Employee" value={`${summary.name} [${summary.employee_code}]`} />
          <InfoField label="Designation" value={summary.designation} />
          <InfoField label="Department" value={summary.department} />
          <InfoField label="PAN No" value={summary.pan_no} />
          <InfoField label="UAN No" value={summary.uan_no} />
          <InfoField label="Aadhar No" value={summary.aadhar_no} />
          <InfoField label="PF No" value={summary.pf_no} />
          <InfoField label="ESIC No" value={summary.esic_no} />
          <InfoField label="Payment Mode" value={summary.payment_mode} />
          <InfoField label="Date of Join" value={formatFullDate(summary.date_of_joining)} />
          <InfoField label="Location" value={summary.location} />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 stagger-rise">
        <StatCard label="Present" value={summary.present_days} />
        <StatCard label="WeeklyOff" value={summary.weekoff_days} />
        <StatCard label="Holiday" value={summary.holiday_days} />
        <StatCard label="LeaveAdj" value={summary.pl_days} />
        <StatCard label="Paid Days" value={summary.paid_days} />
        <StatCard label="Without Pay" value={summary.without_pay_days} accent={summary.without_pay_days > 0 ? "text-rust-500" : "text-ink"} />
        <StatCard label="Total Days" value={summary.days_in_month} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 stagger-rise">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <LedgerTable title="Earnings" rows={earningsRows} totalLabel="Total Earnings" total={totalEarnings} />
        <LedgerTable title="Deductions" rows={deductionsRows} totalLabel="Total Deductions" total={totalDeductions} accentClass="text-rust-500" />
      </div>

      {pl && (
        <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
          <p className="px-5 pt-4 pb-2 text-xs font-semibold uppercase tracking-wider text-ink/70">Leave Ledger</p>
          <table className="w-full text-sm">
            <thead className="text-left sticky top-0 z-10 bg-paper">
              <tr className="border-b border-ink/10">
                <th className="px-5 py-2 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Description</th>
                <th className="px-5 py-2 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Opening</th>
                <th className="px-5 py-2 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Debit</th>
                <th className="px-5 py-2 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Credit</th>
                <th className="px-5 py-2 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Closing</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-5 py-2 text-ink/80">PL (Privilege Leave)</td>
                <td className="px-5 py-2 text-right font-nums text-ink">{pl.opening}</td>
                <td className="px-5 py-2 text-right font-nums text-ink">{pl.debit}</td>
                <td className="px-5 py-2 text-right font-nums text-ink">{pl.credit}</td>
                <td className="px-5 py-2 text-right font-nums text-ink">{pl.closing}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-ledger-800 rounded-sm shadow-card p-7 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="relative flex justify-between items-baseline">
          <span className="font-display text-manila text-lg">Net Salary</span>
          <span className="font-nums font-semibold text-3xl text-manila">{formatINR(summary.total_payable)}</span>
        </div>
      </div>

      {showDailyAttendance && (
        <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto print-hide">
          <p className="px-5 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-ink/70">Daily attendance</p>
          <table className="w-full text-sm mt-2">
            <thead className="text-left sticky top-0 z-10 bg-paper">
              <tr className="border-b-2 border-ink/10">
                <th className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Date</th>
                <th className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">In</th>
                <th className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Out</th>
                <th className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Hours</th>
                <th className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">OT Hours</th>
                <th className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>
              </tr>
            </thead>
            <tbody>
              {summary.daily?.map((d) => (
                <tr key={d.date} className="border-b border-ink/[0.05] last:border-0">
                  <td className="px-5 py-2 font-nums text-ink/70">{formatDate(d.date)}</td>
                  <td className="px-5 py-2 font-nums text-ink/70">
                    {formatTime(d.first_in)}
                    {d.late && <span className="ml-1.5 text-[10px] font-sans font-semibold text-rust-500 uppercase tracking-wide">Late</span>}
                  </td>
                  <td className="px-5 py-2 font-nums text-ink/70">{formatTime(d.last_out)}</td>
                  <td className="px-5 py-2 font-nums">{d.hours_worked ? formatHoursMins(d.hours_worked) : "—"}</td>
                  <td className="px-5 py-2 font-nums text-ochre-700">{d.ot_hours ? formatHoursMins(d.ot_hours) : "—"}</td>
                  <td className="px-5 py-2">
                    <StampBadge status={d.status}>{d.status}</StampBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
