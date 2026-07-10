import { Bell, Flag, Plane, Printer, X } from "lucide-react";
import { useEffect, useState } from "react";

import DisputeModal from "../../components/DisputeModal.jsx";
import LedgerLine from "../../components/LedgerLine.jsx";
import LeaveRequestModal from "../../components/LeaveRequestModal.jsx";
import MonthPicker from "../../components/MonthPicker.jsx";
import SelfieCheckinCard from "../../components/SelfieCheckinCard.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import StatCard from "../../components/StatCard.jsx";
import api from "../../lib/api.js";
import { formatDate, formatINR, formatTime } from "../../lib/format.js";

const today = new Date();
const LEAVE_LABELS = {
  casual: "Casual", sick: "Sick", earned: "Privilege (PL)", unpaid: "Unpaid", other: "Other",
  paternity: "Paternity", maternity: "Maternity", compassionate: "Compassionate", comp_off: "Comp-Off",
};

export default function Dashboard() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [summary, setSummary] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disputeDate, setDisputeDate] = useState(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [dismissedNotice, setDismissedNotice] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/api/me/payroll", { params: { year, month } }),
      api.get("/api/me/disputes"),
      api.get("/api/me/leave-requests"),
      api.get("/api/me/leave-balance"),
    ])
      .then(([payroll, disputesRes, leaveRes, balanceRes]) => {
        setSummary(payroll.data);
        setDisputes(disputesRes.data);
        setLeaveRequests(leaveRes.data);
        setLeaveBalance(balanceRes.data);
        setDismissedNotice(false);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [year, month]);

  const disputedDates = new Set(disputes.filter((d) => d.status === "pending").map((d) => d.date));
  const todayIso = new Date().toISOString().slice(0, 10);

  // seen_by_employee reflects state *before* this fetch (the backend marks
  // them seen server-side as a read side-effect), so this only fires once.
  const freshUpdates = [
    ...disputes.filter((d) => d.status !== "pending" && !d.seen_by_employee).map((d) => ({
      kind: "dispute", id: d.id, status: d.status,
      text: `Your reported issue for ${formatDate(d.date)} was ${d.status}`,
    })),
    ...leaveRequests.filter((l) => l.status !== "pending" && !l.seen_by_employee).map((l) => ({
      kind: "leave", id: l.id, status: l.status,
      text: `Your ${LEAVE_LABELS[l.leave_type]} leave (${formatDate(l.start_date)}–${formatDate(l.end_date)}) was ${l.status}`,
    })),
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 no-print">
        <h2 className="font-display text-2xl text-ink">My Dashboard</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 transition-colors"
          >
            <Printer size={15} /> Print Payslip
          </button>
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
      </div>

      {!dismissedNotice && freshUpdates.length > 0 && (
        <div className="bg-ochre-50 border border-ochre-400/40 rounded-sm px-4 py-3 mb-6 flex items-start gap-3">
          <Bell size={16} className="text-ochre-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1">
            {freshUpdates.map((u) => (
              <p key={`${u.kind}-${u.id}`} className="text-sm text-ink/80">{u.text}</p>
            ))}
          </div>
          <button onClick={() => setDismissedNotice(true)} aria-label="Dismiss" className="text-ink/70 hover:text-ink">
            <X size={16} />
          </button>
        </div>
      )}

      <div className="no-print">
        <SelfieCheckinCard />
      </div>

      {loading || !summary ? (
        <p className="text-ink/70">Loading ledger…</p>
      ) : (
        <div className="print-area">
          {summary.red_card && (
            <div className="bg-rust-50 border border-rust-500/40 rounded-sm px-4 py-3 mb-6 text-sm text-rust-500 no-print">
              <strong>Red Card this cycle</strong> — {summary.late_mark_count} late marks recorded (23rd–22nd cycle). Leave
              taken during a Red Card cycle is treated as Loss of Pay unless corrected by HR.
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6 stagger-rise">
            <StatCard label="Present Days" value={`${summary.present_days}/${summary.days_in_month}`} />
            <StatCard label="Absent Days" value={summary.absent_days} />
            <StatCard label="Hours Worked" value={summary.total_hours_worked} />
            <StatCard label="OT Hours" value={summary.total_ot_hours} accent="text-ochre-700" />
            <StatCard label="OT Amount" value={formatINR(summary.ot_amount)} accent="text-ochre-700" />
          </div>

          <div className="bg-paper rounded-sm shadow-card p-6 mb-6 border-t-4 border-ochre-500">
            <p className="text-xs font-semibold uppercase tracking-wider text-ochre-700 mb-4">Overtime calculation</p>
            <LedgerLine label="Basic" value={formatINR(summary.basic)} />
            <LedgerLine label="HRA" value={formatINR(summary.hra)} />
            <LedgerLine label="Conveyance" value={formatINR(summary.conveyance)} />
            <LedgerLine label="Total salary" value={formatINR(summary.basic + summary.hra + summary.conveyance)} strong />
            <div className="mt-3">
              <LedgerLine label="Per day salary" value={formatINR(summary.per_day_salary)} />
              <LedgerLine label="Per hour salary" value={formatINR(summary.per_hour_salary)} />
              <LedgerLine label="Total OT hours" value={summary.total_ot_hours} />
              <LedgerLine label="OT amount" value={formatINR(summary.ot_amount)} strong accent="text-ochre-700" />
            </div>
            {summary.lop_amount > 0 && (
              <div className="mt-3">
                <LedgerLine label={`Loss of Pay (${summary.lop_half_days} late-mark half-day${summary.lop_half_days === 1 ? "" : "s"})`} value={`− ${formatINR(summary.lop_amount)}`} strong accent="text-rust-500" />
              </div>
            )}
          </div>

          <div className="bg-ledger-800 rounded-sm shadow-card p-6 relative overflow-hidden mb-6">
            <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
            <div className="relative flex justify-between items-baseline">
              <span className="font-display text-manila text-base">Total payable this month</span>
              <span className="font-nums font-semibold text-2xl text-manila">{formatINR(summary.total_payable)}</span>
            </div>
          </div>

          <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Leave balance ({today.getFullYear()})</p>
              <button
                onClick={() => setShowLeaveModal(true)}
                className="flex items-center gap-1.5 bg-jade-600 text-white px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-jade-700 transition-colors"
              >
                <Plane size={13} /> Request Leave
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {leaveBalance.filter((b) => !["unpaid", "maternity", "compassionate"].includes(b.leave_type)).map((b) => (
                <div key={b.leave_type}>
                  <p className="text-[11px] uppercase tracking-wider text-ink/70">{LEAVE_LABELS[b.leave_type]}</p>
                  <p className="font-nums text-lg text-ink mt-0.5">
                    {b.remaining} <span className="text-ink/65 text-sm">/ {b.allocated}</span>
                  </p>
                </div>
              ))}
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
                  <th className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {summary.daily.map((d) => (
                  <tr key={d.date} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                    <td className="px-5 py-2.5 font-nums text-ink/70">{formatDate(d.date)}</td>
                    <td className="px-5 py-2.5 font-nums text-ink/70">
                      {formatTime(d.first_in)}
                      {d.late && <span className="ml-1.5 text-[10px] font-sans font-semibold text-rust-500 uppercase tracking-wide">Late</span>}
                      {d.lop_half_day && <span className="ml-1.5 text-[10px] font-sans font-semibold text-rust-500 uppercase tracking-wide">½ LOP</span>}
                    </td>
                    <td className="px-5 py-2.5 font-nums text-ink/70">{formatTime(d.last_out)}</td>
                    <td className="px-5 py-2.5 font-nums">{d.hours_worked || "—"}</td>
                    <td className="px-5 py-2.5">
                      <StampBadge status={d.status}>
                        {d.status === "leave"
                          ? `${LEAVE_LABELS[d.leave_type]} leave${d.red_card_lop ? " · LOP (Red Card)" : ""}`
                          : d.status === "holiday"
                          ? d.holiday_description || "holiday"
                          : d.corrected ? `${d.status} · corrected` : d.status}
                      </StampBadge>
                    </td>
                    <td className="px-5 py-2.5">
                      {d.status !== "future" && d.status !== "leave" && d.date <= todayIso && (
                        disputedDates.has(d.date) ? (
                          <span className="text-xs text-ochre-700 flex items-center gap-1"><Flag size={12} /> Reported</span>
                        ) : (
                          <button
                            onClick={() => setDisputeDate(d.date)}
                            className="text-xs text-ink/70 hover:text-ochre-700 flex items-center gap-1 transition-colors"
                          >
                            <Flag size={12} /> Report issue
                          </button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {disputes.length > 0 && (
            <div className="bg-paper rounded-sm shadow-card overflow-hidden mt-6">
              <p className="px-5 pt-4 pb-3 text-xs font-semibold uppercase tracking-wider text-ink/70">My reported issues</p>
              <table className="w-full text-sm">
                <tbody>
                  {disputes.map((d) => (
                    <tr key={d.id} className="border-t border-ink/[0.06]">
                      <td className="px-5 py-3 font-nums text-ink/70 w-28">{formatDate(d.date)}</td>
                      <td className="px-5 py-3 text-ink/70">{d.reason}</td>
                      <td className="px-5 py-3">
                        <StampBadge status={d.status}>{d.status}</StampBadge>
                        {d.admin_note && <div className="text-xs text-ink/70 mt-1">{d.admin_note}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {leaveRequests.length > 0 && (
            <div className="bg-paper rounded-sm shadow-card overflow-hidden mt-6">
              <p className="px-5 pt-4 pb-3 text-xs font-semibold uppercase tracking-wider text-ink/70">My leave requests</p>
              <table className="w-full text-sm">
                <tbody>
                  {leaveRequests.map((l) => (
                    <tr key={l.id} className="border-t border-ink/[0.06]">
                      <td className="px-5 py-3 font-nums text-ink/70 w-40">{formatDate(l.start_date)}–{formatDate(l.end_date)}</td>
                      <td className="px-5 py-3 text-ink/70 w-24">{LEAVE_LABELS[l.leave_type]}</td>
                      <td className="px-5 py-3 text-ink/70">{l.reason}</td>
                      <td className="px-5 py-3">
                        <StampBadge status={l.status}>{l.status}</StampBadge>
                        {l.admin_note && <div className="text-xs text-ink/70 mt-1">{l.admin_note}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {disputeDate && (
        <DisputeModal
          date={disputeDate}
          onClose={() => setDisputeDate(null)}
          onSubmitted={() => { setDisputeDate(null); load(); }}
        />
      )}
      {showLeaveModal && (
        <LeaveRequestModal
          onClose={() => setShowLeaveModal(false)}
          onSubmitted={() => { setShowLeaveModal(false); load(); }}
        />
      )}
    </div>
  );
}
