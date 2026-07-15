import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../../components/MonthPicker.jsx";
import api from "../../../lib/api.js";
import { formatINR } from "../../../lib/format.js";

const today = new Date();
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

async function exportExcel(rows, year, month) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => ({
    "Employee Code": r.employee_code,
    "Name": r.name,
    "Location": r.location,
    "PT": r.ded_pt,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PT Sheet");
  XLSX.writeFile(wb, `jade-hr-pt-sheet-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}

export default function PtReport() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data.filter((r) => r.ded_pt > 0)))
      .finally(() => setLoading(false));
  }, [year, month]);

  const total = rows.reduce((s, r) => s + r.ded_pt, 0);

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <h2 className="font-display text-2xl text-ink">PT Sheet &amp; Challan</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => exportExcel(rows, year, month)}
            disabled={!rows.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
      </div>

      <div className="bg-ledger-800 rounded-sm shadow-card p-6 relative overflow-hidden mb-6">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="relative flex justify-between items-baseline">
          <span className="font-display text-manila text-lg">Total PT to deposit ({rows.length} employees)</span>
          <span className="font-nums font-semibold text-3xl text-manila">{formatINR(total)}</span>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Location</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">PT</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={3}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={3}>No PT-applicable employees this month.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                  </td>
                  <td className="px-4 py-3 text-ink/80">{r.location}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.ded_pt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
