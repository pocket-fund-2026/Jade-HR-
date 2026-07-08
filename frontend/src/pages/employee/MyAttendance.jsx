import { useEffect, useState } from "react";

import MonthPicker from "../../components/MonthPicker.jsx";
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
        <h2 className="text-xl font-semibold">My Attendance</h2>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      {loading || !summary ? (
        <p className="text-gray-400">Loading...</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard label="Present Days" value={`${summary.present_days}/${summary.days_in_month}`} />
            <StatCard label="Absent Days" value={summary.absent_days} />
            <StatCard label="Hours Worked" value={summary.total_hours_worked} />
            <StatCard label="OT Hours" value={summary.total_ot_hours} accent="text-jade-700" />
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Date</th>
                  <th className="px-4 py-2 font-medium">In</th>
                  <th className="px-4 py-2 font-medium">Out</th>
                  <th className="px-4 py-2 font-medium">Hours</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.daily.map((d) => (
                  <tr key={d.date}>
                    <td className="px-4 py-2">{formatDate(d.date)}</td>
                    <td className="px-4 py-2">{formatTime(d.first_in)}</td>
                    <td className="px-4 py-2">{formatTime(d.last_out)}</td>
                    <td className="px-4 py-2">{d.hours_worked || "-"}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs ${
                          d.status === "present"
                            ? "bg-jade-50 text-jade-700"
                            : d.status === "absent"
                              ? "bg-red-50 text-red-600"
                              : "bg-gray-100 text-gray-400"
                        }`}
                      >
                        {d.status}
                      </span>
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
