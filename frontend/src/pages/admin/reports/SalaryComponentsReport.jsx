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

// "earned" = prorated for the month's attendance (as on the Salary Sheet);
// "rate" = the full standing monthly amount.
const COLUMNS = [
  { label: "Basic", key: "basic", rateKey: "basic_rate" },
  { label: "HRA", key: "hra", rateKey: "hra_rate" },
  { label: "Conv", key: "conveyance", rateKey: "conveyance_rate" },
  { label: "Other Allow", key: "other_allowance", rateKey: "other_allowance_rate" },
  { label: "Monthly Bonus", key: "monthly_bonus", rateKey: "monthly_bonus_rate" },
  { label: "Retention", key: "retention", rateKey: "retention_rate" },
  { label: "Incentive", key: "incentive", rateKey: "incentive_rate" },
];
const val = (r, c, basis) => Number(basis === "rate" ? r[c.rateKey] : r[c.key]) || 0;

// Same column layout as the EmployeeSalary sheet HR uses.
async function exportExcel(rows, year, month, basis) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => {
    const out = { "Employee Code": r.employee_code, "Full Name": r.name };
    for (const c of COLUMNS) out[c.label] = val(r, c, basis);
    return out;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "EmployeeSalary");
  XLSX.writeFile(wb, `EmployeeSalary-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}

export default function SalaryComponentsReport() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [basis, setBasis] = useState("earned");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [year, month]);


  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Employee Salary Components</h2>
          <p className="text-xs text-ink/70 mt-1">
            Earnings components for {MONTH_NAMES[month - 1]} {year} ({rows.length} employees), from the monthly payroll.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => exportExcel(rows, year, month, basis)}
            disabled={!rows.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <select
            value={basis}
            onChange={(e) => setBasis(e.target.value)}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            <option value="earned">Earned this month</option>
            <option value="rate">Full monthly rate</option>
          </select>
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
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
                    <td key={c.key} className="px-4 py-3 font-nums">{formatINR(val(r, c, basis))}</td>
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
