import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../../lib/api.js";
import { formatINR } from "../../../lib/format.js";

const COLUMNS = [
  { label: "Basic", key: "basic" },
  { label: "HRA", key: "hra" },
  { label: "Conv", key: "conv" },
  { label: "Other Allow", key: "other_allow" },
  { label: "Monthly Bonus", key: "monthly_bonus" },
  { label: "Retention", key: "retention" },
  { label: "Incentive", key: "incentive" },
];

// Same column layout as the EmployeeSalary sheet HR uses.
async function exportExcel(rows) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => {
    const out = { "Employee Code": r.employee_code, "Full Name": r.name };
    for (const c of COLUMNS) out[c.label] = r[c.key];
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "EmployeeSalary");
  XLSX.writeFile(wb, `EmployeeSalary-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function SalaryComponentsReport() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/reports/salary-components", { params: { as_of: asOf } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [asOf]);

  const missing = rows.filter((r) => !r.has_structure).length;

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Employee Salary Components</h2>
          <p className="text-xs text-ink/70 mt-1">
            Each active employee's latest Salary Structure earnings ({rows.length} employees
            {missing ? `, ${missing} with no structure recorded` : ""}).
          </p>
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

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left sticky top-0 z-10 bg-paper shadow-[0_1px_0_rgba(0,0,0,0.08)]">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee Code</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Full Name</th>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={9}><span className="t-shimmer" data-text="Loading…">Loading…</span></td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={9}>No employees.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_code} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3 font-nums text-ink/70">{r.employee_code}</td>
                  <td className="px-4 py-3 text-ink font-medium">{r.name}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="px-4 py-3 font-nums">{formatINR(r[c.key])}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
