import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../../components/MonthPicker.jsx";
import api from "../../../lib/api.js";
import { formatTime } from "../../../lib/format.js";

const today = new Date();
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STATUS_CODE = {
  present: "P", absent: "A", weekoff: "WO", holiday: "H", leave: "L", half_day: "HD", future: "",
};
const STATUS_CLASS = {
  present: "bg-jade-50 text-jade-700", absent: "bg-rust-50 text-rust-600", weekoff: "bg-ink/5 text-ink/40",
  holiday: "bg-ochre-50 text-ochre-700", leave: "bg-manila text-ink/70", half_day: "bg-ochre-50 text-ochre-700",
  future: "text-ink/20",
};

function dayNumber(iso) {
  return Number(iso.slice(8, 10));
}

function cellTitle(d) {
  if (d.status === "present") {
    const late = d.late ? " (late)" : "";
    return `${formatTime(d.first_in)} – ${formatTime(d.last_out)}${late}, ${d.hours_worked}h worked, ${d.ot_hours}h OT`;
  }
  if (d.status === "holiday") return d.holiday_description || "Holiday";
  if (d.status === "leave") return `Leave (${d.leave_type})`;
  return d.status;
}

function summarize(daily) {
  const counts = { present: 0, absent: 0, leave: 0, weekoff: 0, holiday: 0, late: 0 };
  for (const d of daily) {
    if (d.status in counts) counts[d.status] += 1;
    if (d.late) counts.late += 1;
  }
  return counts;
}

async function exportExcel(rows, days, year, month) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => {
    const row = { "Employee Code": r.employee_code, "Name": r.name, "Department": r.department };
    for (const d of r.daily) row[dayNumber(d.date)] = STATUS_CODE[d.status] ?? d.status;
    const s = summarize(r.daily);
    row["Present"] = s.present;
    row["Absent"] = s.absent;
    row["Leave"] = s.leave;
    row["Weekoff"] = s.weekoff;
    row["Holiday"] = s.holiday;
    row["Late"] = s.late;
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Attendance");
  XLSX.writeFile(wb, `jade-hr-attendance-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
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
            P = Present · A = Absent · WO = Weekoff · H = Holiday · L = Leave · HD = Half Day — hover a cell for times
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => exportExcel(rows, days, year, month)}
            disabled={!rows.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
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
                <th key={d.date} className="px-1.5 py-2 font-semibold text-ink/70 text-center w-8">{dayNumber(d.date)}</th>
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
                      <td key={d.date} className="p-0.5 text-center">
                        <span
                          title={cellTitle(d)}
                          className={`inline-flex items-center justify-center w-7 h-6 rounded-sm font-semibold ${STATUS_CLASS[d.status] || ""}`}
                        >
                          {STATUS_CODE[d.status] ?? d.status}
                        </span>
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
