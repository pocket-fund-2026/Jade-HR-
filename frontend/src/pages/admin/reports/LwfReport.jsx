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
    "Employee LWF": r.ded_lwf,
    "Employer LWF": r.lwf_employer,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "LWF Sheet");
  XLSX.writeFile(wb, `jade-hr-lwf-sheet-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}

export default function LwfReport() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data.filter((r) => r.ded_lwf > 0)))
      .finally(() => setLoading(false));
  }, [year, month]);

  const totals = rows.reduce((acc, r) => ({
    employee: acc.employee + r.ded_lwf,
    employer: acc.employer + r.lwf_employer,
  }), { employee: 0, employer: 0 });
  const isHalfYearlyMonth = month === 6 || month === 12;

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <h2 className="font-display text-2xl text-ink">LWF Sheet &amp; Challan</h2>
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

      {!isHalfYearlyMonth && (
        <p className="text-sm text-ink/70 border-l-2 border-ink/20 pl-2.5 py-0.5 mb-4">
          LWF is deducted half-yearly (June and December cycles only) — this month isn't one of them, so no LWF is due.
        </p>
      )}

      <div className="bg-ledger-800 rounded-sm shadow-card p-6 relative overflow-hidden mb-6">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="relative space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-manila/60 mb-3">Challan — {rows.length} employees</p>
          <div className="flex justify-between text-sm text-manila/60"><span>Employee LWF</span><span className="font-nums text-manila">{formatINR(totals.employee)}</span></div>
          <div className="flex justify-between text-sm text-manila/60"><span>Employer LWF</span><span className="font-nums text-manila">{formatINR(totals.employer)}</span></div>
          <div className="flex justify-between items-baseline pt-4 mt-2 border-t border-manila/15">
            <span className="font-display text-manila text-lg">Total to deposit</span>
            <span className="font-nums font-semibold text-3xl text-manila">{formatINR(totals.employee + totals.employer)}</span>
          </div>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Location</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee LWF</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employer LWF</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={4}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={4}>No LWF due this month.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                  </td>
                  <td className="px-4 py-3 text-ink/80">{r.location}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.ded_lwf)}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.lwf_employer)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
