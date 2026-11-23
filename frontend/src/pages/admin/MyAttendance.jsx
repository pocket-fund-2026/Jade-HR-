import { Flag, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";

import AppealModal from "../../components/AppealModal.jsx";
import DisputeModal from "../../components/DisputeModal.jsx";
import MonthPicker from "../../components/MonthPicker.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { currentPayPeriod, formatDate, formatTime } from "../../lib/format.js";

const currentPeriod = currentPayPeriod();

// Self-service attendance for console logins (HR / Accounts), who have no
// employee dashboard: see your own days, dispute one, and appeal a rejection.
export default function MyAttendance() {
  const [year, setYear] = useState(currentPeriod.year);
  const [month, setMonth] = useState(currentPeriod.month);
  const [summary, setSummary] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [disputeDate, setDisputeDate] = useState(null);
  const [appealing, setAppealing] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/api/me/payroll", { params: { year, month } }),
      api.get("/api/me/disputes"),
    ])
      .then(([p, d]) => { setSummary(p.data); setDisputes(d.data); })
      .finally(() => setLoading(false));
  };
  useEffect(load, [year, month]);

  const todayIso = new Date().toISOString().slice(0, 10);
  const pending = new Set(disputes.filter((d) => d.status === "pending").map((d) => d.date));
  const appealed = new Set(disputes.filter((d) => d.appeal_of).map((d) => d.appeal_of));
  const daily = summary?.daily || [];
  const defaultIssue = (() => {
    const x = daily.find((r) => r.date === disputeDate);
    return x?.weekoff_forfeited ? "weekly_off" : x?.late ? "late_coming" : undefined;
  })();

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">My Attendance</h2>
          <p className="text-xs text-ink/70 mt-0.5">Dispute a late mark, a missed punch or a Sunday marked absent. Someone else on the team reviews it, and you can appeal a rejection once.</p>
        </div>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-left bg-paper">
            <tr className="border-b-2 border-ink/10">
              {["Date", "In", "Out", "Status", ""].map((h) => (
                <th key={h} className="px-5 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="px-5 py-6 text-ink/70">Loading…</td></tr>}
            {!loading && daily.map((d) => (
              <tr key={d.date} className="border-b border-ink/[0.06] last:border-0">
                <td className="px-5 py-2.5 font-nums text-ink/70">{formatDate(d.date)}</td>
                <td className="px-5 py-2.5 font-nums text-ink/70">
                  {formatTime(d.first_in)}
                  {d.late && <span className="ml-1.5 text-[10px] font-semibold text-rust-500 uppercase tracking-wide">Late</span>}
                </td>
                <td className="px-5 py-2.5 font-nums text-ink/70">{formatTime(d.last_out)}</td>
                <td className="px-5 py-2.5">
                  <StampBadge status={d.status}>{d.weekoff_forfeited ? "absent · Sunday" : d.corrected ? `${d.status} · corrected` : d.status}</StampBadge>
                </td>
                <td className="px-5 py-2.5">
                  {d.status !== "future" && d.status !== "leave" && d.date <= todayIso && (
                    pending.has(d.date) ? (
                      <span className="text-xs text-ochre-700 flex items-center gap-1"><Flag size={12} /> Reported</span>
                    ) : (
                      <button onClick={() => setDisputeDate(d.date)} className="text-xs text-ink/70 hover:text-ochre-700 flex items-center gap-1 transition-colors">
                        <Flag size={12} /> {d.weekoff_forfeited ? "Dispute Sunday" : d.late ? "Dispute late" : "Report issue"}
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
        <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto mt-6">
          <p className="px-5 pt-4 pb-3 text-xs font-semibold uppercase tracking-wider text-ink/70">My disputes</p>
          <table className="w-full min-w-[520px] text-sm">
            <tbody>
              {disputes.map((d) => (
                <tr key={d.id} className="border-t border-ink/[0.06]">
                  <td className="px-5 py-3 font-nums text-ink/70 w-28">{formatDate(d.date)}</td>
                  <td className="px-5 py-3 text-ink/70">
                    {d.appeal_of && <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wide text-ochre-700">Appeal</span>}
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
                    {d.status === "rejected" && !d.appeal_of && !appealed.has(d.id) && (
                      <button onClick={() => setAppealing(d)} className="block text-xs font-semibold text-jade-700 hover:underline mt-1">Appeal</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {disputeDate && (
        <DisputeModal date={disputeDate} defaultIssue={defaultIssue} onClose={() => setDisputeDate(null)} onSubmitted={() => { setDisputeDate(null); load(); }} />
      )}
      {appealing && <AppealModal dispute={appealing} onClose={() => setAppealing(null)} onSubmitted={() => { setAppealing(null); load(); }} />}
    </div>
  );
}
