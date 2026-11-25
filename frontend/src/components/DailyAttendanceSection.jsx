import { Download, Flag, Paperclip } from "lucide-react";
import { useEffect, useState } from "react";

import AppealModal from "./AppealModal.jsx";
import DisputeModal from "./DisputeModal.jsx";
import DateRangePicker from "./DateRangePicker.jsx";
import StampBadge from "./StampBadge.jsx";
import api from "../lib/api.js";
import { exportDailyAttendanceExcel } from "../lib/attendanceExport.js";
import { formatDate, formatHoursMins, formatTime, lateAllowanceInfo } from "../lib/format.js";

// Daily attendance table on My Payslip / an admin's payroll detail view.
// Defaults to the pay period's own `daily` rows (passed down from the
// payroll summary already loaded by the parent); switching to a custom
// date range fetches independently from /me/attendance (or /attendance/:id
// for an admin viewing someone else) rather than re-running the whole
// payroll calculation, since a range export/lookup has nothing to do with
// pay-period boundaries.
export default function DailyAttendanceSection({ monthDaily, employeeId, employeeCode, name, rangeLabel, selfService = false }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rangeDaily, setRangeDaily] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Self-service (My Payslip): dispute a day, track disputes, appeal a rejection.
  const [disputes, setDisputes] = useState([]);
  const [disputeDate, setDisputeDate] = useState(null);
  const [appealing, setAppealing] = useState(null);
  const loadDisputes = () => {
    if (selfService) api.get("/api/me/disputes").then(({ data }) => setDisputes(data)).catch(() => {});
  };
  useEffect(loadDisputes, [selfService]);
  const todayIso = new Date().toISOString().slice(0, 10);
  const pendingDates = new Set(disputes.filter((x) => x.status === "pending").map((x) => x.date));

  const inRangeMode = rangeDaily !== null;
  const daily = inRangeMode ? rangeDaily : monthDaily;
  const activeLabel = inRangeMode ? `${from} to ${to}` : rangeLabel;

  const applyRange = async () => {
    if (!from || !to) return;
    setLoading(true);
    setError("");
    try {
      const endpoint = employeeId ? `/api/attendance/${employeeId}` : "/api/me/attendance";
      const { data } = await api.get(endpoint, { params: { from, to } });
      setRangeDaily(data.daily);
    } catch (e) {
      setError(e?.response?.data?.detail || "Could not load that range");
    } finally {
      setLoading(false);
    }
  };

  const clearRange = () => {
    setFrom("");
    setTo("");
    setRangeDaily(null);
    setError("");
  };

  const handleExport = () => {
    exportDailyAttendanceExcel(daily || [], { employeeCode, name, rangeLabel: activeLabel });
  };

  return (
    <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto print-hide">
      <div className="flex flex-wrap items-center justify-between gap-4 px-5 pt-4 pb-1 no-print">
        <p className="text-xs font-semibold text-ink/70">Daily attendance</p>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} onClear={inRangeMode ? clearRange : undefined} disabled={loading} />
          <button
            onClick={applyRange}
            disabled={loading || !from || !to}
            className="text-xs font-semibold text-ink bg-paper border border-ink/15 rounded-sm px-[1.5em] py-[0.625em] leading-tight hover:border-jade-500 transition-colors disabled:opacity-50"
          >
            {loading ? "Loading…" : "Apply date range"}
          </button>
          <button
            onClick={handleExport}
            disabled={!daily?.length}
            className="flex items-center gap-1.5 text-xs font-semibold text-ink bg-paper border border-ink/15 rounded-sm px-[1.5em] py-[0.625em] leading-tight hover:border-jade-500 transition-colors disabled:opacity-50"
          >
            <Download size={13} /> Export to Excel
          </button>
        </div>
      </div>
      {error && <p className="px-5 pb-2 text-xs text-rust-500 no-print">{error}</p>}
      <table className="w-full text-sm mt-2">
        <thead className="text-left sticky top-0 z-10 bg-paper">
          <tr className="border-b-2 border-ink/10">
            <th className="px-5 py-2.5 font-semibold text-[11px] text-ink/70">Date</th>
            <th className="px-5 py-2.5 font-semibold text-[11px] text-ink/70">In</th>
            <th className="px-5 py-2.5 font-semibold text-[11px] text-ink/70">Out</th>
            <th className="px-5 py-2.5 font-semibold text-[11px] text-ink/70">Hours</th>
            <th className="px-5 py-2.5 font-semibold text-[11px] text-ink/70"><abbr className="acr">OT</abbr> Hours</th>
            <th className="px-5 py-2.5 font-semibold text-[11px] text-ink/70">Status</th>
            {selfService && <th className="px-5 py-2.5 no-print"></th>}
          </tr>
        </thead>
        <tbody>
          {daily?.map((d) => (
            <tr key={d.date} className="border-b border-ink/[0.05] last:border-0">
              <td className="px-5 py-2 font-nums text-ink/70">{formatDate(d.date)}</td>
              <td className="px-5 py-2 font-nums text-ink/70">
                {formatTime(d.first_in)}
                {d.late && <span className="ml-1.5 text-[10px] font-sans font-semibold text-rust-500">Late</span>}
                {lateAllowanceInfo(d) && (
                <span title={lateAllowanceInfo(d).text} className={`ml-1.5 text-[10px] font-sans font-semibold ${lateAllowanceInfo(d).used ? "text-jade-600" : "text-ochre-700"}`}>
                  {lateAllowanceInfo(d).short}
                </span>
              )}
              </td>
              <td className="px-5 py-2 font-nums text-ink/70">{formatTime(d.last_out)}</td>
              <td className="px-5 py-2 font-nums">{d.hours_worked ? formatHoursMins(d.hours_worked) : "—"}</td>
              <td className="px-5 py-2 font-nums text-ochre-700">{d.ot_hours ? formatHoursMins(d.ot_hours) : "—"}</td>
              <td className="px-5 py-2">
                <StampBadge status={d.status}>{d.weekoff_forfeited ? "absent · Sunday" : d.status}</StampBadge>
              </td>
              {selfService && (
                <td className="px-5 py-2 no-print">
                  {d.status !== "future" && d.status !== "leave" && d.date <= todayIso && (
                    pendingDates.has(d.date) ? (
                      <span className="text-xs text-ochre-700 flex items-center gap-1"><Flag size={12} /> Reported</span>
                    ) : (
                      <button onClick={() => setDisputeDate(d.date)} className="text-xs text-ink/70 hover:text-ochre-700 flex items-center gap-1 transition-colors whitespace-nowrap">
                        <Flag size={12} /> {d.weekoff_forfeited ? "Dispute Sunday" : d.late ? "Dispute late" : "Report issue"}
                      </button>
                    )
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {selfService && disputes.length > 0 && (
        <div className="border-t border-ink/10 mt-2 no-print">
          <p className="px-5 pt-4 pb-2 text-xs font-semibold text-ink/70">My attendance disputes</p>
          <table className="w-full text-sm">
            <tbody>
              {disputes.map((x) => (
                <tr key={x.id} className="border-t border-ink/[0.06]">
                  <td className="px-5 py-2.5 font-nums text-ink/70 w-28">{formatDate(x.date)}</td>
                  <td className="px-5 py-2.5 text-ink/70">
                    {x.appeal_of && <span className="mr-1.5 text-[10px] font-semibold text-ochre-700">Appeal</span>}
                    {x.reason}
                    {x.photo_url && (
                      <a href={x.photo_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-jade-700 hover:underline mt-1">
                        <Paperclip size={11} /> {x.photo_filename || "Photo"}
                      </a>
                    )}
                  </td>
                  <td className="px-5 py-2.5">
                    <StampBadge status={x.status}>{x.status}</StampBadge>
                    {x.admin_note && <div className="text-xs text-ink/70 mt-1">{x.admin_note}</div>}
                    {x.hr_response && <div className="text-xs text-ink/80 mt-1 border-l-2 border-jade-500 pl-2"><strong>HR response:</strong> {x.hr_response}</div>}
                    {x.status === "rejected" && !x.appeal_of && !disputes.some((y) => y.appeal_of === x.id) && (
                      <button onClick={() => setAppealing(x)} className="block text-xs font-semibold text-jade-700 hover:underline mt-1">Appeal</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {disputeDate && (
        <DisputeModal
          date={disputeDate}
          defaultIssue={(() => { const r = (daily || []).find((z) => z.date === disputeDate); return r?.weekoff_forfeited ? "weekly_off" : r?.late ? "late_coming" : undefined; })()}
          onClose={() => setDisputeDate(null)}
          onSubmitted={() => { setDisputeDate(null); loadDisputes(); }}
        />
      )}
      {appealing && <AppealModal dispute={appealing} onClose={() => setAppealing(null)} onSubmitted={() => { setAppealing(null); loadDisputes(); }} />}
    </div>
  );
}
