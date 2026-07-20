import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../../components/MonthPicker.jsx";
import api from "../../../lib/api.js";
import { dayNumber, exportAttendanceExcel, exportAttendanceTimingsExcel, STATUS_CODE, summarize } from "../../../lib/attendanceExport.js";
import { formatHoursMins, formatTime } from "../../../lib/format.js";

const today = new Date();

const STATUS_CLASS = {
  present: "bg-jade-50 text-jade-700", absent: "bg-rust-50 text-rust-600", weekoff: "bg-ink/5 text-ink/40",
  holiday: "bg-ochre-50 text-ochre-700", leave: "bg-manila text-ink/70", half_day: "bg-ochre-50 text-ochre-700",
  future: "text-ink/20",
};

function cellTitle(d) {
  if (d.status === "present") {
    const late = d.late ? " (late)" : "";
    return `${formatTime(d.first_in)} – ${formatTime(d.last_out)}${late}, ${formatHoursMins(d.hours_worked)} worked, ${formatHoursMins(d.ot_hours)} OT`;
  }
  if (d.status === "holiday") return d.holiday_description || "Holiday";
  if (d.status === "leave") return `Leave (${d.leave_type})`;
  return d.status;
}

export default function AttendanceReport() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/reports/attendance", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [year, month]);

  const days = rows[0]?.daily ?? [];

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Attendance Sheet</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">
            P = Present · A = Absent · WO = Weekoff · H = Holiday · L = Leave · HD = Half Day — in/out time shown under each punched day, hover a cell for hours &amp; OT
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => exportAttendanceExcel(rows, year, month)}
            disabled={!rows.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <button
            onClick={() => exportAttendanceTimingsExcel(rows, year, month)}
            disabled={!rows.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Timings (Datewise)
          </button>
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wider text-ink/70 sticky left-0 bg-paper">Employee</th>
              {days.map((d) => (
                <th key={d.date} className="px-1 py-2 font-semibold text-ink/70 text-center w-14">{dayNumber(d.date)}</th>
              ))}
              <th className="px-2 py-2 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-center">P</th>
              <th className="px-2 py-2 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-center">A</th>
              <th className="px-2 py-2 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-center">L</th>
              <th className="px-2 py-2 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-center">Late</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={days.length + 5}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={days.length + 5}>No employees found.</td></tr>
            ) : (
              rows.map((r) => {
                const s = summarize(r.daily);
                return (
                  <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                    <td className="px-3 py-2 sticky left-0 bg-paper">
                      <span className="text-ink font-medium">{r.name}</span>
                      <div className="text-ink/70 font-nums">{r.employee_code}</div>
                    </td>
                    {r.daily.map((d) => (
                      <td key={d.date} title={cellTitle(d)} className="p-0.5 text-center align-top">
                        <div className="flex flex-col items-center gap-0.5">
                          <span
                            className={`inline-flex items-center justify-center w-7 h-5 rounded-sm font-semibold ${STATUS_CLASS[d.status] || ""}`}
                          >
                            {STATUS_CODE[d.status] ?? d.status}
                          </span>
                          {d.first_in && (
                            <span className="text-[9px] leading-none text-ink/50 font-nums whitespace-nowrap">
                              {formatTime(d.first_in)}
                            </span>
                          )}
                          {d.first_in && (
                            <span className="text-[9px] leading-none text-ink/50 font-nums whitespace-nowrap">
                              {formatTime(d.last_out)}
                            </span>
                          )}
                        </div>
                      </td>
                    ))}
                    <td className="px-2 py-2 font-nums text-center">{s.present}</td>
                    <td className="px-2 py-2 font-nums text-center">{s.absent}</td>
                    <td className="px-2 py-2 font-nums text-center">{s.leave}</td>
                    <td className="px-2 py-2 font-nums text-center text-rust-600">{s.late}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
