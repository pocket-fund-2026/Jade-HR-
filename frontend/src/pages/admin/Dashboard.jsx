import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../components/MonthPicker.jsx";
import StampBadge from "../../components/StampBadge.jsx";
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
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-2xl text-ink">Dashboard</h2>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>
      <p className="text-xs text-ink/40 font-nums mb-6">
        {lastSync
          ? `Last biometric sync ${new Date(lastSync.run_at).toLocaleString("en-IN")} — ${lastSync.inserted} new punches`
          : "No biometric sync has run yet."}
      </p>

      {error && <p className="text-sm text-rust-500 mb-4 border-l-2 border-rust-500 pl-2.5">{error}</p>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard label="Active Employees" value={rows.length} />
        <StatCard label="Total OT Hours" value={totals.otHours.toFixed(1)} />
        <StatCard label="Total OT Amount" value={formatINR(totals.otAmount)} accent="text-ochre-500" />
        <StatCard label="Total Payable" value={formatINR(totals.payable)} accent="text-jade-600" />
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Employee</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Present</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Absent</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">OT Hours</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">OT Amount</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Total Payable</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/40 text-center" colSpan={6}>Loading ledger…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/40 text-center" colSpan={6}>No employees yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link to={`/admin/payroll/${r.employee_id}?year=${year}&month=${month}`} className="text-ink hover:text-jade-600 font-medium transition-colors">
                      {r.name}
                    </Link>
                    <div className="text-xs text-ink/40 font-nums">{r.employee_code}</div>
                  </td>
                  <td className="px-5 py-3.5 font-nums">{r.present_days}/{r.days_in_month}</td>
                  <td className="px-5 py-3.5 font-nums">
                    {r.absent_days > 0 ? <StampBadge status="absent">{r.absent_days} absent</StampBadge> : <span className="text-ink/30">—</span>}
                  </td>
                  <td className="px-5 py-3.5 font-nums">{r.total_ot_hours}</td>
                  <td className="px-5 py-3.5 font-nums text-ochre-600">{formatINR(r.ot_amount)}</td>
                  <td className="px-5 py-3.5 font-nums font-semibold text-ink">{formatINR(r.total_payable)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
