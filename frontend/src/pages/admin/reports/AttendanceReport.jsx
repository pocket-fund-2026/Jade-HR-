import { ArrowLeft, FileSpreadsheet, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../../components/MonthPicker.jsx";
import api from "../../../lib/api.js";
import { useAuth } from "../../../lib/auth.jsx";
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
    const compOff = d.comp_off_eligible ? " — Comp-Off eligible (worked a weekoff/holiday)" : "";
    return `${formatTime(d.first_in)} – ${formatTime(d.last_out)}${late}, ${formatHoursMins(d.hours_worked)} worked, ${formatHoursMins(d.ot_hours)} OT${compOff}`;
  }
  if (d.status === "holiday") return d.holiday_description || "Holiday";
  if (d.status === "leave") return `Leave (${d.leave_type})`;
  return d.status;
}

function EditCellModal({ employee, day, onClose, onSaved }) {
  const [statusOverride, setStatusOverride] = useState(day.status === "absent" || day.status === "half_day" ? day.status : "present");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // formatTime renders e.g. "9:05 AM" — <input type=time> needs 24h HH:MM,
  // so re-derive from the raw ISO instead of parsing the display string.
  const to24h = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const [inVal, setInVal] = useState(to24h(day.first_in));
  const [outVal, setOutVal] = useState(to24h(day.last_out));

  const save = async () => {
    setError("");
    setBusy(true);
    try {
      await api.put(`/api/attendance-overrides/${employee.employee_id}`, {
        date: day.date,
        status_override: statusOverride,
        first_in: statusOverride === "present" && inVal ? `${inVal}:00` : null,
        last_out: statusOverride === "present" && outVal ? `${outVal}:00` : null,
        note,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-sm p-6 border-t-4 border-jade-500">
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">Edit attendance</p>
        <p className="font-display text-lg text-ink mb-4">{employee.name} — {day.date}</p>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Status</label>
            <select
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              value={statusOverride}
              onChange={(e) => setStatusOverride(e.target.value)}
            >
              <option value="present">Present</option>
              <option value="half_day">Half Day</option>
              <option value="absent">Absent</option>
            </select>
          </div>
          {statusOverride === "present" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">In time</label>
                <input type="time" value={inVal} onChange={(e) => setInVal(e.target.value)}
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm font-nums focus:outline-none focus:ring-2 focus:ring-jade-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Out time</label>
                <input type="time" value={outVal} onChange={(e) => setOutVal(e.target.value)}
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm font-nums focus:outline-none focus:ring-2 focus:ring-jade-500" />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Note</label>
            <input value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
          </div>
        </div>

        {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mt-3">{error}</p>}

        <div className="flex justify-end gap-3 pt-4">
          <button type="button" onClick={onClose} className="text-sm text-ink/70 hover:text-ink px-2">Cancel</button>
          <button
            onClick={save}
            disabled={busy}
            className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AttendanceReport() {
  const { can } = useAuth();
  const canEdit = can("disputes.manage");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // { employee, day }

  const load = () => {
    setLoading(true);
    api.get("/api/reports/attendance", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [year, month]);

  const days = rows[0]?.daily ?? [];

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Attendance Sheet</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>P = Present · A = Absent · WO = Weekoff · H = Holiday · L = Leave · HD = Half Day — hover a cell for hours &amp; OT. Green dot = Comp-Off eligible.</span>
            {canEdit && (
              <span className="inline-flex items-center gap-1 text-jade-700">
                <Pencil size={11} /> Click any cell to correct it.
              </span>
            )}
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
                    {r.daily.map((d) => {
                      const editable = canEdit && d.status !== "future";
                      return (
                        <td
                          key={d.date}
                          title={editable ? `${cellTitle(d)} — click to edit` : cellTitle(d)}
                          onClick={editable ? () => setEditing({ employee: r, day: d }) : undefined}
                          className={`p-0.5 text-center align-top ${editable ? "cursor-pointer hover:ring-1 hover:ring-jade-500 hover:ring-inset" : ""}`}
                        >
                          <div className="flex flex-col items-center gap-0.5">
                            <span
                              className={`relative inline-flex items-center justify-center w-7 h-5 rounded-sm font-semibold ${STATUS_CLASS[d.status] || ""}`}
                            >
                              {STATUS_CODE[d.status] ?? d.status}
                              {d.comp_off_eligible && (
                                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-jade-500 ring-1 ring-paper" />
                              )}
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
                      );
                    })}
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

      {editing && (
        <EditCellModal
          employee={editing.employee}
          day={editing.day}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}
