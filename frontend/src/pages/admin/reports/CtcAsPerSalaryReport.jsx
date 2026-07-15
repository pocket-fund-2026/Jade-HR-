import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../../lib/api.js";
import { formatFullDate, formatINR } from "../../../lib/format.js";

async function exportExcel(rows) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => ({
    "Employee Code": r.employee_code,
    "Name": r.name,
    "Location": r.location,
    "Structure Effective Date": r.effective_date || "No structure recorded",
    "Net Salary (Monthly)": r.net_salary,
    "CTC Monthly": r.ctc_monthly,
    "CTC Yearly": r.ctc_yearly,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CTC As Per Salary");
  XLSX.writeFile(wb, `jade-hr-ctc-as-per-salary-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function CtcAsPerSalaryReport() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/reports/ctc-as-per-salary", { params: { as_of: asOf } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [asOf]);

  const total = rows.reduce((s, r) => s + r.ctc_yearly, 0);

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">CTC As Per Salary Structure</h2>
          <p className="text-xs text-ink/70 mt-1">Each employee's most recent Salary Structure revision — not a recomputation from actual payslips.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => exportExcel(rows)}
            disabled={!rows.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <label className="flex items-center gap-2 bg-paper rounded-sm shadow-card px-3 py-2">
            <span className="text-xs text-ink/70 font-medium">As of</span>
            <input
              type="date"
              value={asOf}
              onChange={(e) => setAsOf(e.target.value)}
              className="rounded-sm border border-ink/15 bg-manila/40 px-2 py-1 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
            />
          </label>
        </div>
      </div>

      <div className="bg-ledger-800 rounded-sm shadow-card p-6 relative overflow-hidden mb-6">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="relative flex justify-between items-baseline">
          <span className="font-display text-manila text-lg">Total CTC Yearly ({rows.length} employees)</span>
          <span className="font-nums font-semibold text-3xl text-manila">{formatINR(total)}</span>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Structure Effective</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Net Salary</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">CTC Monthly</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">CTC Yearly</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={5}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={5}>No employees.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code} · {r.location}</div>
                  </td>
                  <td className="px-4 py-3 font-nums text-ink/70">
                    {r.has_structure ? formatFullDate(r.effective_date) : <span className="italic text-ink/50">No structure recorded</span>}
                  </td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.net_salary)}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.ctc_monthly)}</td>
                  <td className="px-4 py-3 font-nums font-semibold text-jade-700">{formatINR(r.ctc_yearly)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
