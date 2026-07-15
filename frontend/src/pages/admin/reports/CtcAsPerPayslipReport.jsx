import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MonthRangePicker from "../../../components/MonthRangePicker.jsx";
import api from "../../../lib/api.js";
import { formatINR } from "../../../lib/format.js";

const today = new Date();
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function grossEarnings(r) {
  return r.basic + r.hra + r.conveyance + r.other_allowance + r.monthly_bonus + r.retention + r.incentive + r.ot_amount;
}
function employerContributions(r) {
  return r.pf_employer_eps + r.pf_employer_epf + r.pf_edli_charges + r.pf_admin_charges + r.esic_employer + r.lwf_employer;
}
function ctc(r) {
  return grossEarnings(r) + employerContributions(r);
}

async function exportExcel(rows, fromYear, fromMonth, toYear, toMonth) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => ({
    "Employee Code": r.employee_code,
    "Name": r.name,
    "Location": r.location,
    "Months Included": r.months_included,
    "Gross Earnings": grossEarnings(r),
    "Employer PF (EPS+EPF+EDLI+Admin)": r.pf_employer_eps + r.pf_employer_epf + r.pf_edli_charges + r.pf_admin_charges,
    "Employer ESIC": r.esic_employer,
    "Employer LWF": r.lwf_employer,
    "CTC (period)": ctc(r),
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "CTC As Per Payslip");
  XLSX.writeFile(wb, `jade-hr-ctc-as-per-payslip-${MONTH_NAMES[fromMonth - 1]}-${fromYear}-to-${MONTH_NAMES[toMonth - 1]}-${toYear}.xlsx`);
}

export default function CtcAsPerPayslipReport() {
  const [fromYear, setFromYear] = useState(today.getFullYear());
  const [fromMonth, setFromMonth] = useState(1);
  const [toYear, setToYear] = useState(today.getFullYear());
  const [toMonth, setToMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api.get("/api/payroll/range", { params: { from_year: fromYear, from_month: fromMonth, to_year: toYear, to_month: toMonth } })
      .then(({ data }) => setRows(data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load"))
      .finally(() => setLoading(false));
  }, [fromYear, fromMonth, toYear, toMonth]);

  const total = rows.reduce((s, r) => s + ctc(r), 0);

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">CTC As Per Payslip</h2>
          <p className="text-xs text-ink/70 mt-1">Actual cost for the selected period — gross earnings plus employer PF/ESIC/LWF contributions from real payslips, not the Salary Structure's snapshot.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => exportExcel(rows, fromYear, fromMonth, toYear, toMonth)}
            disabled={!rows.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <MonthRangePicker
            fromYear={fromYear} fromMonth={fromMonth} toYear={toYear} toMonth={toMonth}
            onChange={(fy, fm, ty, tm) => { setFromYear(fy); setFromMonth(fm); setToYear(ty); setToMonth(tm); }}
          />
        </div>
      </div>

      {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mb-4">{error}</p>}

      <div className="bg-ledger-800 rounded-sm shadow-card p-6 relative overflow-hidden mb-6">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="relative flex justify-between items-baseline">
          <span className="font-display text-manila text-lg">Total CTC for period ({rows.length} employees)</span>
          <span className="font-nums font-semibold text-3xl text-manila">{formatINR(total)}</span>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Months</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Gross Earnings</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employer PF</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employer ESIC</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employer LWF</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">CTC (period)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={7}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={7}>No employees match.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code} · {r.location}</div>
                  </td>
                  <td className="px-4 py-3 font-nums text-ink/70">{r.months_included}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(grossEarnings(r))}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.pf_employer_eps + r.pf_employer_epf + r.pf_edli_charges + r.pf_admin_charges)}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.esic_employer)}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.lwf_employer)}</td>
                  <td className="px-4 py-3 font-nums font-semibold text-jade-700">{formatINR(ctc(r))}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
