import { Download } from "lucide-react";
import { useState } from "react";

import DateRangePicker from "./DateRangePicker.jsx";
import StampBadge from "./StampBadge.jsx";
import api from "../lib/api.js";
import { exportDailyAttendanceExcel } from "../lib/attendanceExport.js";
import { formatDate, formatHoursMins, formatTime } from "../lib/format.js";

// Daily attendance table on My Payslip / an admin's payroll detail view.
// Defaults to the pay period's own `daily` rows (passed down from the
// payroll summary already loaded by the parent); switching to a custom
// date range fetches independently from /me/attendance (or /attendance/:id
// for an admin viewing someone else) rather than re-running the whole
// payroll calculation, since a range export/lookup has nothing to do with
// pay-period boundaries.
export default function DailyAttendanceSection({ monthDaily, employeeId, employeeCode, name, rangeLabel }) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rangeDaily, setRangeDaily] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-1 no-print">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Daily attendance</p>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangePicker from={from} to={to} onChange={(f, t) => { setFrom(f); setTo(t); }} onClear={inRangeMode ? clearRange : undefined} disabled={loading} />
          <button
            onClick={applyRange}
            disabled={loading || !from || !to}
            className="text-xs font-semibold text-ink bg-paper border border-ink/15 rounded-sm px-2.5 py-1.5 hover:border-jade-500 transition-colors disabled:opacity-50"
          >
            {loading ? "Loading…" : "Apply"}
          </button>
          <button
            onClick={handleExport}
            disabled={!daily?.length}
            className="flex items-center gap-1.5 text-xs font-semibold text-ink bg-paper border border-ink/15 rounded-sm px-2.5 py-1.5 hover:border-jade-500 transition-colors disabled:opacity-50"
          >
            <Download size={13} /> Export
          </button>
        </div>
      </div>
      {error && <p className="px-5 pb-2 text-xs text-rust-500 no-print">{error}</p>}
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
          {daily?.map((d) => (
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
  );
}
