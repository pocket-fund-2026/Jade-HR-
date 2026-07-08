import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../components/MonthPicker.jsx";
import StatCard from "../../components/StatCard.jsx";
import api from "../../lib/api.js";
import { formatINR } from "../../lib/format.js";

const today = new Date();

export default function Dashboard() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .catch(() => setError("Could not load payroll summary"))
      .finally(() => setLoading(false));
  }, [year, month]);

  useEffect(() => {
    api
      .get("/api/biometric/sync-log")
      .then(({ data }) => setLastSync(data[0] || null))
      .catch(() => {});
  }, []);

  const totals = rows.reduce(
    (acc, r) => ({
      otHours: acc.otHours + r.total_ot_hours,
      otAmount: acc.otAmount + r.ot_amount,
      payable: acc.payable + r.total_payable,
    }),
    { otHours: 0, otAmount: 0, payable: 0 },
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Dashboard</h2>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

      <p className="text-xs text-gray-400 mb-4">
        {lastSync
          ? `Last biometric sync: ${new Date(lastSync.run_at).toLocaleString("en-IN")} — ${lastSync.inserted} new punches (${lastSync.status})`
          : "No biometric sync has run yet."}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Employees" value={rows.length} />
        <StatCard label="Total OT Hours" value={totals.otHours.toFixed(1)} />
        <StatCard label="Total OT Amount" value={formatINR(totals.otAmount)} accent="text-jade-700" />
        <StatCard label="Total Payable" value={formatINR(totals.payable)} accent="text-jade-700" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Present</th>
              <th className="px-4 py-3 font-medium">Absent</th>
              <th className="px-4 py-3 font-medium">OT Hours</th>
              <th className="px-4 py-3 font-medium">OT Amount</th>
              <th className="px-4 py-3 font-medium">Total Payable</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td className="px-4 py-6 text-gray-400" colSpan={6}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-6 text-gray-400" colSpan={6}>No employees yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link to={`/admin/payroll/${r.employee_id}?year=${year}&month=${month}`} className="text-jade-700 hover:underline">
                      {r.name}
                    </Link>
                    <div className="text-xs text-gray-400">{r.employee_code}</div>
                  </td>
                  <td className="px-4 py-3">{r.present_days}/{r.days_in_month}</td>
                  <td className="px-4 py-3">{r.absent_days}</td>
                  <td className="px-4 py-3">{r.total_ot_hours}</td>
                  <td className="px-4 py-3">{formatINR(r.ot_amount)}</td>
                  <td className="px-4 py-3 font-medium">{formatINR(r.total_payable)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
