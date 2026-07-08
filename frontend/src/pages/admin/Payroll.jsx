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
        <div>
          <h2 className="font-display text-2xl text-ink">Payroll &amp; OT</h2>
          <p className="text-xs text-ink/40 font-nums mt-0.5">
            OT = (Basic + HRA + Conveyance) &divide; days in month &divide; hours &times; OT hours
          </p>
        </div>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Employee</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Gross (B+H+C)</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Per Day</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Per Hour</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">OT Hours</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">OT Amount</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Total Payable</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/40 text-center" colSpan={8}>Loading ledger…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/40 text-center" colSpan={8}>No employees yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/40 font-nums">{r.employee_code}</div>
                  </td>
                  <td className="px-5 py-3.5 font-nums">{formatINR(r.basic + r.hra + r.conveyance)}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/60">{formatINR(r.per_day_salary)}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/60">{formatINR(r.per_hour_salary)}</td>
                  <td className="px-5 py-3.5 font-nums">{r.total_ot_hours}</td>
                  <td className="px-5 py-3.5 font-nums font-semibold text-ochre-600">{formatINR(r.ot_amount)}</td>
                  <td className="px-5 py-3.5 font-nums font-semibold text-ink">{formatINR(r.total_payable)}</td>
                  <td className="px-5 py-3.5">
                    <Link
                      to={`/admin/payroll/${r.employee_id}?year=${year}&month=${month}`}
                      className="text-jade-600 hover:text-jade-700 hover:underline text-xs font-medium"
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
