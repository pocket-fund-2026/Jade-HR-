import { Flag } from "lucide-react";
import { useEffect, useState } from "react";

import DisputeModal from "../../components/DisputeModal.jsx";
import MonthPicker from "../../components/MonthPicker.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import StatCard from "../../components/StatCard.jsx";
import api from "../../lib/api.js";
import { formatDate, formatINR, formatTime } from "../../lib/format.js";

const today = new Date();

export default function Dashboard() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [summary, setSummary] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disputeDate, setDisputeDate] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/api/me/payroll", { params: { year, month } }),
      api.get("/api/me/disputes"),
    ])
      .then(([payroll, disputesRes]) => {
        setSummary(payroll.data);
        setDisputes(disputesRes.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, [year, month]);

  const disputedDates = new Set(disputes.filter((d) => d.status === "pending").map((d) => d.date));
  const todayIso = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl text-ink">My Dashboard</h2>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      {loading || !summary ? (
        <p className="text-ink/40">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            <StatCard label="Present Days" value={`${summary.present_days}/${summary.days_in_month}`} />
            <StatCard label="Absent Days" value={summary.absent_days} />
            <StatCard label="Hours Worked" value={summary.total_hours_worked} />
            <StatCard label="OT Hours" value={summary.total_ot_hours} accent="text-ochre-500" />
            <StatCard label="OT Amount" value={formatINR(summary.ot_amount)} accent="text-ochre-500" />
          </div>

          <div className="bg-ledger-800 rounded-sm shadow-card p-6 relative overflow-hidden mb-6">
            <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
            <div className="relative flex justify-between items-baseline">
              <span className="font-display text-manila text-base">Total payable this month</span>
              <span className="font-nums font-semibold text-2xl text-manila">{formatINR(summary.total_payable)}</span>
            </div>
          </div>

          <div className="bg-paper rounded-sm shadow-card overflow-hidden">
            <p className="px-5 pt-4 pb-1 text-xs font-semibold uppercase tracking-wider text-ink/45">Daily attendance</p>
            <table className="w-full text-sm mt-2">
              <thead className="text-left">
                <tr className="border-b-2 border-ink/10">
                  <th className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Date</th>
                  <th className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/45">In</th>
                  <th className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Out</th>
                  <th className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Hours</th>
                  <th className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Status</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {summary.daily.map((d) => (
                  <tr key={d.date} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                    <td className="px-5 py-2.5 font-nums text-ink/70">{formatDate(d.date)}</td>
                    <td className="px-5 py-2.5 font-nums text-ink/70">{formatTime(d.first_in)}</td>
                    <td className="px-5 py-2.5 font-nums text-ink/70">{formatTime(d.last_out)}</td>
                    <td className="px-5 py-2.5 font-nums">{d.hours_worked || "—"}</td>
                    <td className="px-5 py-2.5">
                      <StampBadge status={d.status}>{d.corrected ? `${d.status} · corrected` : d.status}</StampBadge>
                    </td>
                    <td className="px-5 py-2.5">
                      {d.status !== "future" && d.date <= todayIso && (
                        disputedDates.has(d.date) ? (
                          <span className="text-xs text-ochre-600 flex items-center gap-1"><Flag size={12} /> Reported</span>
                        ) : (
                          <button
                            onClick={() => setDisputeDate(d.date)}
                            className="text-xs text-ink/40 hover:text-ochre-600 flex items-center gap-1 transition-colors"
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
              <p className="px-5 pt-4 pb-3 text-xs font-semibold uppercase tracking-wider text-ink/45">My reported issues</p>
              <table className="w-full text-sm">
                <tbody>
                  {disputes.map((d) => (
                    <tr key={d.id} className="border-t border-ink/[0.06]">
                      <td className="px-5 py-3 font-nums text-ink/70 w-28">{formatDate(d.date)}</td>
                      <td className="px-5 py-3 text-ink/70">{d.reason}</td>
                      <td className="px-5 py-3">
                        <StampBadge status={d.status}>{d.status}</StampBadge>
                        {d.admin_note && <div className="text-xs text-ink/40 mt-1">{d.admin_note}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {disputeDate && (
        <DisputeModal
          date={disputeDate}
          onClose={() => setDisputeDate(null)}
          onSubmitted={() => { setDisputeDate(null); load(); }}
        />
      )}
    </div>
  );
}
