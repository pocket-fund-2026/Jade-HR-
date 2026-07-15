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

// "Days Paid" on the statutory ESIC template is the NCP (Non-Contribution
// Period) day count — days with no wages (absent/unpaid leave/LOP) —
// distinct from "PaidDays" (the days actually paid). Mirrors
// without_pay_days from the payslip engine. "Daily Wages" and "OT ESIC"
// aren't separately computed by this system: Daily Wages is derived here
// (ESIC Wages ÷ PaidDays) and OT ESIC is left blank, since OT amount isn't
// part of the ESIC contribution wage base (statutory.py's compute_esic).
function esicRow(r) {
  const dailyWages = r.paid_days > 0 ? Math.round(r.esic_wages / r.paid_days) : 0;
  return { ...r, ncpDays: r.without_pay_days, dailyWages };
}

async function exportExcel(rows, year, month) {
  const XLSX = await import("xlsx");
  const data = rows.map((raw) => {
    const r = esicRow(raw);
    return {
      "ESIC NO": r.esic_no,
      "Employee Code": r.employee_code,
      "Full Name": r.name,
      "PaidDays": r.paid_days,
      "Days Paid": r.ncpDays,
      "ESIC Wages": r.esic_wages,
      "ESIC Employer": r.esic_employer,
      "ESIC": r.ded_esic,
      "Total": r.ded_esic + r.esic_employer,
      "Daily Wages": r.dailyWages,
      "OT ESIC": "",
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "ESIC Sheet");
  XLSX.writeFile(wb, `jade-hr-esic-sheet-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}

export default function EsicReport() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data.filter((r) => r.esic_wages > 0)))
      .finally(() => setLoading(false));
  }, [year, month]);

  const totals = rows.reduce((acc, r) => ({
    wages: acc.wages + r.esic_wages,
    employee: acc.employee + r.ded_esic,
    employer: acc.employer + r.esic_employer,
  }), { wages: 0, employee: 0, employer: 0 });
  const totalDeposit = totals.employee + totals.employer;

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <h2 className="font-display text-2xl text-ink">ESIC Sheet &amp; Challan</h2>
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
        <div className="relative space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-manila/60 mb-3">Challan — {rows.length} employees (gross ≤ ₹21,000)</p>
          <div className="flex justify-between text-sm text-manila/60"><span>Employee ESIC (0.75%)</span><span className="font-nums text-manila">{formatINR(totals.employee)}</span></div>
          <div className="flex justify-between text-sm text-manila/60"><span>Employer ESIC (3.25%)</span><span className="font-nums text-manila">{formatINR(totals.employer)}</span></div>
          <div className="flex justify-between items-baseline pt-4 mt-2 border-t border-manila/15">
            <span className="font-display text-manila text-lg">Total to deposit</span>
            <span className="font-nums font-semibold text-3xl text-manila">{formatINR(totalDeposit)}</span>
          </div>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">ESIC No</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">PaidDays</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Days Paid (NCP)</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">ESIC Wages</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee ESIC</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employer ESIC</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Total</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Daily Wages</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">OT ESIC</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={10}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={10}>No ESIC-applicable employees this month.</td></tr>
            ) : (
              rows.map((raw) => {
                const r = esicRow(raw);
                return (
                  <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                    <td className="px-4 py-3 font-nums text-ink/80">{r.esic_no || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-ink font-medium">{r.name}</span>
                      <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                    </td>
                    <td className="px-4 py-3 font-nums">{r.paid_days}</td>
                    <td className="px-4 py-3 font-nums">{r.ncpDays}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.esic_wages)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.ded_esic)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.esic_employer)}</td>
                    <td className="px-4 py-3 font-nums font-semibold">{formatINR(r.ded_esic + r.esic_employer)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.dailyWages)}</td>
                    <td className="px-4 py-3 font-nums text-ink/40">—</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
