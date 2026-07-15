import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../../lib/api.js";
import { formatINR } from "../../../lib/format.js";

async function exportExcel(rows) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => ({
    "Employee Code": r.employee_code,
    "Name": r.name,
    "Status": r.is_active ? "Active" : "Inactive",
    "Service Start": r.service_start,
    "Reference Date": r.reference_date,
    "Eligible": r.eligible ? "Yes" : "No",
    "Years of Service": r.years_of_service,
    "Gratuity Amount": r.gratuity_amount,
    "Capped at Statutory Ceiling": r.capped ? "Yes" : "No",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Gratuity");
  XLSX.writeFile(wb, `jade-hr-gratuity.xlsx`);
}

export default function GratuityReport() {
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showActiveOnly, setShowActiveOnly] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/reports/gratuity", { params: { as_of: asOf } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [asOf]);

  const filtered = showActiveOnly ? rows.filter((r) => r.is_active) : rows;
  const eligible = filtered.filter((r) => r.eligible);
  const totalGratuity = eligible.reduce((s, r) => s + r.gratuity_amount, 0);

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Gratuity Calculation</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">15/26 x last-drawn Basic x years of service, capped at ₹20,00,000 — active employees shown "as of" the date below; separated employees use their recorded Exit Date</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={showActiveOnly} onChange={(e) => setShowActiveOnly(e.target.checked)} className="w-4 h-4 accent-jade-600" />
            Active only
          </label>
          <input
            type="date"
            aria-label="As of date"
            value={asOf}
            onChange={(e) => setAsOf(e.target.value)}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          />
          <button
            onClick={() => exportExcel(filtered)}
            disabled={!filtered.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
        </div>
      </div>

      <div className="bg-ledger-800 rounded-sm shadow-card p-6 relative overflow-hidden mb-6">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="relative flex justify-between items-baseline">
          <span className="font-display text-manila text-lg">Total accrued/payable gratuity ({eligible.length} of {filtered.length} eligible)</span>
          <span className="font-nums font-semibold text-3xl text-manila">{formatINR(totalGratuity)}</span>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Eligible</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Years of Service</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Gratuity Amount</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={5}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={5}>No employees found.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code} · {r.location}</div>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{r.is_active ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-3">
                    <span className={r.eligible ? "text-jade-700 font-medium" : "text-ink/40"}>{r.eligible ? "Yes" : "No"}</span>
                  </td>
                  <td className="px-4 py-3 font-nums text-ink/70">{r.years_of_service}</td>
                  <td className="px-4 py-3 font-nums font-semibold text-jade-700">
                    {formatINR(r.gratuity_amount)}
                    {r.capped && <span className="ml-1.5 text-[10px] font-sans font-semibold text-ochre-700 uppercase tracking-wide">Capped</span>}
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
