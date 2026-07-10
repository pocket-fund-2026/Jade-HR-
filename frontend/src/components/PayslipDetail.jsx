import { Printer } from "lucide-react";

import LedgerLine from "./LedgerLine.jsx";
import StampBadge from "./StampBadge.jsx";
import StatCard from "./StatCard.jsx";
import { formatDate, formatINR, formatTime, payPeriodLabel } from "../lib/format.js";

const OFFICE_ADDRESS =
  "Madhu Estate Office, Ground Floor, Pandurang Budhkar Marg, Lower Parel, Mumbai, Maharashtra 400013";

export default function PayslipDetail({ summary }) {
  if (!summary) return null;

  const gross = summary.basic + summary.hra + summary.conveyance;

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
          <p className="font-display text-ink text-lg leading-none">Payslip</p>
          <p className="text-ink/70 text-xs font-nums mt-1.5">{payPeriodLabel(summary.year, summary.month)}</p>
          <p className="text-ink font-medium text-sm mt-3">{summary.name}</p>
          <p className="text-ink/70 text-xs font-nums mt-0.5">{summary.employee_code} &middot; {summary.location}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 stagger-rise">
        <StatCard label="Present Days" value={`${summary.present_days}/${summary.days_in_month}`} />
        <StatCard label="Hours Worked" value={summary.total_hours_worked} />
        <StatCard label="OT Hours" value={summary.total_ot_hours} />
        <StatCard label="OT Amount" value={formatINR(summary.ot_amount)} accent="text-ochre-700" />
      </div>

      <div className="bg-paper rounded-sm shadow-card p-7 border-t-4 border-ochre-500">
        <p className="text-xs font-semibold uppercase tracking-wider text-ochre-700 mb-1">Overtime calculation</p>
        <p className="text-xs text-ink/65 mb-4 font-nums">
          (Basic + HRA + Conveyance) &divide; days in month &divide; standard hours &times; OT hours
        </p>
        <div>
          <LedgerLine label="Basic" value={formatINR(summary.basic)} />
          <LedgerLine label="HRA" value={formatINR(summary.hra)} />
          <LedgerLine label="Conveyance" value={formatINR(summary.conveyance)} />
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
          <LedgerLine label="Total OT hours" value={summary.total_ot_hours} />
          <LedgerLine label="OT amount" value={formatINR(summary.ot_amount)} strong accent="text-ochre-700" />
        </div>
      </div>

      <div className="bg-ledger-800 rounded-sm shadow-card p-7 relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="relative space-y-2">
          <div className="flex justify-between text-sm text-manila/60">
            <span>Gross salary (Basic + HRA + Conveyance + Other)</span>
            <span className="font-nums text-manila">{formatINR(summary.gross_salary)}</span>
          </div>
          <div className="flex justify-between text-sm text-manila/60">
            <span>OT amount</span>
            <span className="font-nums text-manila">{formatINR(summary.ot_amount)}</span>
          </div>
          <div className="flex justify-between items-baseline pt-4 mt-2 border-t border-manila/15">
            <span className="font-display text-manila text-lg">Total payable</span>
            <span className="font-nums font-semibold text-3xl text-manila">{formatINR(summary.total_payable)}</span>
          </div>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <p className="px-5 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-ink/70">Daily attendance</p>
        <table className="w-full text-sm mt-2">
          <thead className="text-left">
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
                <td className="px-5 py-2 font-nums">{d.hours_worked || "—"}</td>
                <td className="px-5 py-2 font-nums text-ochre-700">{d.ot_hours || "—"}</td>
                <td className="px-5 py-2">
                  <StampBadge status={d.status}>{d.status}</StampBadge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
