import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../../lib/api.js";
import { formatINR } from "../../../lib/format.js";

// FY month order: April(4) through March(3) of the following year.
const FY_MONTH_ORDER = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function currentFinancialYear() {
  const today = new Date();
  const startYear = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

function fyOptions() {
  const current = currentFinancialYear();
  const currentStart = Number(current.split("-")[0]);
  return [currentStart - 1, currentStart].map((y) => `${y}-${String(y + 1).slice(2)}`);
}

async function exportExcel(rows, financialYear) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => {
    const row = { "Emp Name": r.name, "Emp Code": r.employee_code };
    for (const m of FY_MONTH_ORDER) row[MONTH_NAMES[m]] = r.monthly_wages?.[m] ?? 0;
    row["Salary Amt"] = r.salary_amount;
    row["Bonus Per"] = round2(r.rate * 100);
    row["Bonus Amt"] = r.bonus_amount;
    row["Exgratia Amt"] = r.exgratia_amount;
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bonus");
  XLSX.writeFile(wb, `jade-hr-bonus-${financialYear}.xlsx`);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default function BonusReport() {
  const [financialYear, setFinancialYear] = useState(currentFinancialYear());
  const [rate, setRate] = useState(8.33);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/reports/bonus", { params: { financial_year: financialYear, rate: rate / 100 } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [financialYear, rate]);

  const eligible = rows.filter((r) => r.eligible);
  const totalBonus = eligible.reduce((s, r) => s + r.bonus_amount, 0);
  const totalExgratia = rows.reduce((s, r) => s + (r.exgratia_amount || 0), 0);

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Bonus Calculation</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">
            Payment of Bonus Act, 1965 — eligibility ₹21,000/mo; bonus paid on actual Basic drawn each month, uncapped (company policy)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-ink/70">
            Rate
            <input
              type="number" step="0.01" min="8.33" max="20"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
              className="w-20 rounded-sm border border-ink/15 bg-paper px-2 py-1.5 text-sm font-nums focus:outline-none focus:ring-2 focus:ring-jade-500"
            />
            %
          </label>
          <select
            aria-label="Financial year"
            value={financialYear}
            onChange={(e) => setFinancialYear(e.target.value)}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            {fyOptions().map((fy) => <option key={fy} value={fy}>FY {fy}</option>)}
          </select>
          <button
            onClick={() => exportExcel(rows, financialYear)}
            disabled={!rows.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
        </div>
      </div>

      <div className="bg-ledger-800 rounded-sm shadow-card p-6 relative overflow-hidden mb-6">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="relative flex flex-wrap justify-between items-baseline gap-4">
          <span className="font-display text-manila text-lg">Total bonus payable ({eligible.length} of {rows.length} eligible)</span>
          <span className="font-nums font-semibold text-3xl text-manila">{formatINR(totalBonus)}</span>
        </div>
        {totalExgratia > 0 && (
          <div className="relative flex justify-between text-sm text-manila/60 mt-2">
            <span>Total ex-gratia</span><span className="font-nums text-manila">{formatINR(totalExgratia)}</span>
          </div>
        )}
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Emp Code</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Emp Name</th>
              {FY_MONTH_ORDER.map((m) => (
                <th key={m} className="px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">
                  {MONTH_NAMES[m].slice(0, 3)}
                </th>
              ))}
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Salary Amt</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Bonus Per</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Bonus Amt</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Exgratia Amt</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={FY_MONTH_ORDER.length + 6}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={FY_MONTH_ORDER.length + 6}>No employees found.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3 font-nums text-ink/80">{r.employee_code}</td>
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.location}</div>
                  </td>
                  {FY_MONTH_ORDER.map((m) => (
                    <td key={m} className="px-3 py-3 font-nums text-ink/70 text-right">{formatINR(r.monthly_wages?.[m] ?? 0)}</td>
                  ))}
                  <td className="px-4 py-3 font-nums text-right">{formatINR(r.salary_amount)}</td>
                  <td className="px-4 py-3 font-nums text-right">{round2(r.rate * 100)}%</td>
                  <td className={`px-4 py-3 font-nums font-semibold text-right ${r.eligible ? "text-jade-700" : "text-ink/40"}`}>{formatINR(r.bonus_amount)}</td>
                  <td className="px-4 py-3 font-nums text-right">{formatINR(r.exgratia_amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
