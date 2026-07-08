import { useEffect, useState } from "react";

import MonthPicker from "../../components/MonthPicker.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import StatCard from "../../components/StatCard.jsx";
import api from "../../lib/api.js";
import { formatDate, formatTime } from "../../lib/format.js";

const today = new Date();

export default function MyAttendance() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/api/me/payroll", { params: { year, month } })
      .then(({ data }) => setSummary(data))
      .finally(() => setLoading(false));
  }, [year, month]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="font-display text-2xl text-ink">My Attendance</h2>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      {loading || !summary ? (
        <p className="text-ink/40">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Present Days" value={`${summary.present_days}/${summary.days_in_month}`} />
            <StatCard label="Absent Days" value={summary.absent_days} />
            <StatCard label="Hours Worked" value={summary.total_hours_worked} />
            <StatCard label="OT Hours" value={summary.total_ot_hours} accent="text-ochre-500" />
          </div>

          <div className="bg-paper rounded-sm shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="text-left">
                <tr className="border-b-2 border-ink/10">
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Date</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">In</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Out</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Hours</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Status</th>
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
                      <StampBadge status={d.status}>{d.status}</StampBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
