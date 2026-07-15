import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../../lib/api.js";
import { formatINR } from "../../../lib/format.js";

function currentFinancialYear() {
  const today = new Date();
  const startYear = today.getMonth() + 1 >= 4 ? today.getFullYear() : today.getFullYear() - 1;
  return `${startYear}-${String(startYear + 1).slice(2)}`;
}

function fyOptions() {
  const current = currentFinancialYear();
  const currentStart = Number(current.split("-")[0]);
  return [currentStart - 1, currentStart, currentStart + 1].map((y) => `${y}-${String(y + 1).slice(2)}`);
}

async function exportExcel(rows, financialYear) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => ({
    "Employee Code": r.employee_code,
    "Name": r.name,
    "Location": r.location,
    "Regime": r.regime,
    "Projected Annual Gross": r.projected_annual_gross,
    "HRA Exemption": r.hra_exemption,
    "Standard Deduction": r.standard_deduction,
    "80C": r.section_80c_claimed,
    "80D": r.section_80d_claimed,
    "Home Loan Interest": r.home_loan_interest_claimed,
    "Taxable Income": r.taxable_income,
    "Income Tax": r.income_tax,
    "Surcharge": r.surcharge,
    "Cess": r.cess,
    "Annual Tax": r.annual_tax,
    "Months Remaining": r.months_remaining,
    "Monthly TDS": r.monthly_tds,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "TDS Projection");
  XLSX.writeFile(wb, `jade-hr-tds-projection-${financialYear}.xlsx`);
}

export default function TdsProjectionReport() {
  const [financialYear, setFinancialYear] = useState(currentFinancialYear());
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/reports/tds-projection", { params: { financial_year: financialYear } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [financialYear]);

  const totalMonthlyTds = rows.reduce((s, r) => s + r.monthly_tds, 0);
  const taxable = rows.filter((r) => r.annual_tax > 0);

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">TDS Projection</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">Projected annual salary x regime slabs, divided by FY months remaining — see per-employee declarations for HRA/80C/80D inputs</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
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
        <div className="relative flex justify-between items-baseline">
          <span className="font-display text-manila text-lg">Total monthly TDS this cycle ({taxable.length} of {rows.length} taxable)</span>
          <span className="font-nums font-semibold text-3xl text-manila">{formatINR(totalMonthlyTds)}</span>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Regime</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Projected Gross</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Taxable Income</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Annual Tax</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Months Left</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Monthly TDS</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={7}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={7}>No employees found.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code} · {r.location}</div>
                  </td>
                  <td className="px-4 py-3 text-ink/80 capitalize">{r.regime}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.projected_annual_gross)}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.taxable_income)}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.annual_tax)}</td>
                  <td className="px-4 py-3 font-nums text-ink/70">{r.months_remaining}</td>
                  <td className="px-4 py-3 font-nums font-semibold text-jade-700">{formatINR(r.monthly_tds)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
