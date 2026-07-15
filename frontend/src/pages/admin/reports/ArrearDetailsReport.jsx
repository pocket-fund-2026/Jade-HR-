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
    "Effective Date": r.effective_date,
    "Arrear Amount": r.arrear_amount,
    "Total (incl. Arrear)": r.total_arrear,
    "Remarks": r.remarks,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Arrear Details");
  XLSX.writeFile(wb, `jade-hr-arrear-details-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function ArrearDetailsReport() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/reports/arrears", { params: { from_date: fromDate || undefined, to_date: toDate || undefined } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [fromDate, toDate]);

  const total = rows.reduce((s, r) => s + r.arrear_amount, 0);

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <h2 className="font-display text-2xl text-ink">Arrear Details</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => exportExcel(rows)}
            disabled={!rows.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <label className="flex items-center gap-2 bg-paper rounded-sm shadow-card px-3 py-2">
            <span className="text-xs text-ink/70 font-medium">From</span>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="rounded-sm border border-ink/15 bg-manila/40 px-2 py-1 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
            <span className="text-xs text-ink/70 font-medium">To</span>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="rounded-sm border border-ink/15 bg-manila/40 px-2 py-1 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
          </label>
        </div>
      </div>

      <div className="bg-ledger-800 rounded-sm shadow-card p-6 relative overflow-hidden mb-6">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="relative flex justify-between items-baseline">
          <span className="font-display text-manila text-lg">Total Arrears ({rows.length} entries)</span>
          <span className="font-nums font-semibold text-3xl text-manila">{formatINR(total)}</span>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Effective Date</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Arrear Amount</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Total (incl. Arrear)</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Remarks</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={5}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={5}>No arrears recorded{fromDate || toDate ? " for this range" : ""}.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={`${r.employee_id}-${r.effective_date}`} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code} · {r.location}</div>
                  </td>
                  <td className="px-4 py-3 font-nums text-ink/70">{formatFullDate(r.effective_date)}</td>
                  <td className="px-4 py-3 font-nums font-semibold text-jade-700">{formatINR(r.arrear_amount)}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.total_arrear)}</td>
                  <td className="px-4 py-3 text-ink/70">{r.remarks || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
