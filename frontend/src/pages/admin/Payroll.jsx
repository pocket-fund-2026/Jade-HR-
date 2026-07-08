import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../components/MonthPicker.jsx";
import api from "../../lib/api.js";
import { formatINR } from "../../lib/format.js";

const today = new Date();

export default function Payroll() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [year, month]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Payroll & OT</h2>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Employee</th>
              <th className="px-4 py-3 font-medium">Gross (B+H+C)</th>
              <th className="px-4 py-3 font-medium">Per Day</th>
              <th className="px-4 py-3 font-medium">Per Hour</th>
              <th className="px-4 py-3 font-medium">OT Hours</th>
              <th className="px-4 py-3 font-medium">OT Amount</th>
              <th className="px-4 py-3 font-medium">Total Payable</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td className="px-4 py-6 text-gray-400" colSpan={8}>Loading...</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-6 text-gray-400" colSpan={8}>No employees yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {r.name}
                    <div className="text-xs text-gray-400">{r.employee_code}</div>
                  </td>
                  <td className="px-4 py-3">{formatINR(r.basic + r.hra + r.conveyance)}</td>
                  <td className="px-4 py-3">{formatINR(r.per_day_salary)}</td>
                  <td className="px-4 py-3">{formatINR(r.per_hour_salary)}</td>
                  <td className="px-4 py-3">{r.total_ot_hours}</td>
                  <td className="px-4 py-3 font-medium text-jade-700">{formatINR(r.ot_amount)}</td>
                  <td className="px-4 py-3 font-medium">{formatINR(r.total_payable)}</td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/admin/payroll/${r.employee_id}?year=${year}&month=${month}`}
                      className="text-jade-700 hover:underline text-xs"
                    >
                      Details
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
