import { Bell, Briefcase, Flag, Paperclip, Plane, Printer, X } from "lucide-react";
import { useEffect, useState } from "react";

import AbsenceRequestModal from "../../components/AbsenceRequestModal.jsx";
import DisputeModal from "../../components/DisputeModal.jsx";
import LeaveRequestModal from "../../components/LeaveRequestModal.jsx";
import MonthPicker from "../../components/MonthPicker.jsx";
import PayslipDetail from "../../components/PayslipDetail.jsx";
import SelfieCheckinCard from "../../components/SelfieCheckinCard.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { currentPayPeriod, formatDate, formatHolidayDate, formatHoursMins, formatTime } from "../../lib/format.js";
import { LEAVE_LABELS } from "../../lib/leaveTypes.js";

const today = new Date();
const DAY_TYPE_LABELS = {
  closed: "Store closed",
  day_off: "Day Off (paid, same as store closed)",
  open_statutory: "Open (statutory pay)",
  open_till_4pm: "Open till a set time",
  open_normal: "Open (no special pay)",
  anniversary: "Anniversary (informational only)",
};

export default function Dashboard() {
  const [year, setYear] = useState(currentPayPeriod().year);
  const [month, setMonth] = useState(currentPayPeriod().month);
  const [summary, setSummary] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveBalance, setLeaveBalance] = useState([]);
  const [absenceRequests, setAbsenceRequests] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disputeDate, setDisputeDate] = useState(null);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showAbsenceModal, setShowAbsenceModal] = useState(false);
  const [dismissedNotice, setDismissedNotice] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/api/me/payroll", { params: { year, month } }),
      api.get("/api/me/disputes"),
      api.get("/api/me/leave-requests"),
      api.get("/api/me/leave-balance"),
      api.get("/api/me/absence-requests"),
      api.get("/api/me/holidays", { params: { year: today.getFullYear() } }),
    ])
      .then(([payroll, disputesRes, leaveRes, balanceRes, absenceRes, holidaysRes]) => {
        setSummary(payroll.data);
        setDisputes(disputesRes.data);
        setLeaveRequests(leaveRes.data);
        setLeaveBalance(balanceRes.data);
        setAbsenceRequests(absenceRes.data);
        setHolidays(holidaysRes.data);
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
          <div className="mb-6">
            <PayslipDetail summary={summary} showDailyAttendance={false} />
          </div>

          <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Leave balance ({today.getFullYear()})</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowLeaveModal(true)}
                  className="flex items-center gap-1.5 bg-jade-600 text-white px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-jade-700 transition-colors"
                >
                  <Plane size={13} /> Request Leave
                </button>
                <button
                  onClick={() => setShowAbsenceModal(true)}
                  className="flex items-center gap-1.5 bg-paper border border-ink/15 text-ink px-3 py-1.5 rounded-sm text-xs font-semibold hover:border-jade-500 transition-colors"
                >
                  <Briefcase size={13} /> Report Work Absence
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {leaveBalance.filter((b) => !["unpaid", "maternity", "compassionate"].includes(b.leave_type)).map((b) => (
                <div key={b.leave_type}>
                  <p className="text-[11px] uppercase tracking-wider text-ink/70">{LEAVE_LABELS[b.leave_type]}</p>
                  <p className="font-nums text-lg text-ink mt-0.5">
                    {b.remaining} <span className="text-ink/65 text-sm">/ {b.allocated}</span>
                  </p>
                  {b.leave_type === "paid" && b.carried_forward > 0 && (
                    <p className="text-[10px] text-ink/50 mt-0.5">
                      incl. {Math.round(b.carried_forward * 10) / 10} carried forward
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-4">Holidays ({today.getFullYear()})</p>
            {holidays.length === 0 ? (
              <p className="text-sm text-ink/70">No holidays scheduled for {today.getFullYear()}.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {holidays.map((h) => (
                    <tr key={h.id} className="border-t border-ink/[0.06] first:border-0">
                      <td className="py-2 pr-4 font-nums text-ink/70 w-28">{formatHolidayDate(h.holiday_date)}</td>
                      <td className="py-2 pr-4 text-ink">{h.description}</td>
                      <td className="py-2 text-ink/70">{DAY_TYPE_LABELS[h.day_type] || h.day_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
            <p className="px-5 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-ink/70">Daily attendance</p>
            <table className="w-full text-sm mt-2">
              <thead className="text-left sticky top-0 z-10 bg-paper">
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
                      {d.lop_days > 0 && (
                        <span className="ml-1.5 text-[10px] font-sans font-semibold text-rust-500 uppercase tracking-wide">
                          ½ LOP
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2.5 font-nums text-ink/70">{formatTime(d.last_out)}</td>
                    <td className="px-5 py-2.5 font-nums">{d.hours_worked ? formatHoursMins(d.hours_worked) : "—"}</td>
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
                      <td className="px-5 py-3 text-ink/70">
                        {d.reason}
                        {d.photo_url && (
                          <a href={d.photo_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-jade-700 hover:underline mt-1">
                            <Paperclip size={11} /> {d.photo_filename || "Photo"}
                          </a>
                        )}
                      </td>
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

          {absenceRequests.length > 0 && (
            <div className="bg-paper rounded-sm shadow-card overflow-hidden mt-6">
              <p className="px-5 pt-4 pb-3 text-xs font-semibold uppercase tracking-wider text-ink/70">My work absence requests</p>
              <table className="w-full text-sm">
                <tbody>
                  {absenceRequests.map((a) => (
                    <tr key={a.id} className="border-t border-ink/[0.06]">
                      <td className="px-5 py-3 font-nums text-ink/70 w-40">{formatDate(a.start_date)}–{formatDate(a.end_date)}</td>
                      <td className="px-5 py-3 text-ink/70 w-24 font-nums">{a.number_of_days} day{a.number_of_days === 1 ? "" : "s"}</td>
                      <td className="px-5 py-3 text-ink/70">{a.details}</td>
                      <td className="px-5 py-3 text-ink/70">{a.approver_name}</td>
                      <td className="px-5 py-3">
                        <StampBadge status={a.status}>{a.status}</StampBadge>
                        {a.admin_note && <div className="text-xs text-ink/70 mt-1">{a.admin_note}</div>}
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
      {showAbsenceModal && (
        <AbsenceRequestModal
          onClose={() => setShowAbsenceModal(false)}
          onSubmitted={() => { setShowAbsenceModal(false); load(); }}
        />
      )}
    </div>
  );
}
