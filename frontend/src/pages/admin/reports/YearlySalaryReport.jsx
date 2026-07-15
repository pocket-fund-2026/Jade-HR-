import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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
function totalDeductions(r) {
  return r.ded_pf + r.ded_esic + r.ded_pt + r.ded_lwf;
}

async function exportExcel(rows, fromYear, fromMonth, toYear, toMonth) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => ({
    "Employee Code": r.employee_code,
    "Name": r.name,
    "Location": r.location,
    "Months Included": r.months_included,
    "Basic": r.basic,
    "HRA": r.hra,
    "Conveyance": r.conveyance,
    "Other Allowance": r.other_allowance,
    "Monthly Bonus": r.monthly_bonus,
    "Retention": r.retention,
    "Incentive": r.incentive,
    "OT Amount": r.ot_amount,
    "Gross Earnings": grossEarnings(r),
    "PF": r.ded_pf,
    "ESIC": r.ded_esic,
    "PT": r.ded_pt,
    "LWF": r.ded_lwf,
    "Total Deductions": totalDeductions(r),
    "Net Salary": r.total_payable,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Cumulative Salary");
  XLSX.writeFile(wb, `jade-hr-cumulative-salary-${MONTH_NAMES[fromMonth - 1]}-${fromYear}-to-${MONTH_NAMES[toMonth - 1]}-${toYear}.xlsx`);
}

export default function YearlySalaryReport() {
  const [fromYear, setFromYear] = useState(today.getFullYear());
  const [fromMonth, setFromMonth] = useState(1);
  const [toYear, setToYear] = useState(today.getFullYear());
  const [toMonth, setToMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [location, setLocation] = useState("all");

  useEffect(() => {
    setLoading(true);
    setError("");
    api.get("/api/payroll/range", { params: { from_year: fromYear, from_month: fromMonth, to_year: toYear, to_month: toMonth } })
      .then(({ data }) => setRows(data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load"))
      .finally(() => setLoading(false));
  }, [fromYear, fromMonth, toYear, toMonth]);

  const locations = useMemo(() => [...new Set(rows.map((r) => r.location).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(
    () => (location === "all" ? rows : rows.filter((r) => r.location === location)),
    [rows, location],
  );
  const totals = useMemo(
    () => filtered.reduce((acc, r) => ({
      gross: acc.gross + grossEarnings(r),
      deductions: acc.deductions + totalDeductions(r),
      net: acc.net + r.total_payable,
    }), { gross: 0, deductions: 0, net: 0 }),
    [filtered],
  );

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <h2 className="font-display text-2xl text-ink">Yearly / Cumulative Salary Details</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            <option value="all">All locations</option>
            {locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
          </select>
          <button
            onClick={() => exportExcel(filtered, fromYear, fromMonth, toYear, toMonth)}
            disabled={!filtered.length}
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

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-paper rounded-sm shadow-card px-5 py-4 border-t-2 border-ink/10">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">Gross Earnings</p>
          <p className="font-display text-xl text-ink mt-1">{formatINR(totals.gross)}</p>
        </div>
        <div className="bg-paper rounded-sm shadow-card px-5 py-4 border-t-2 border-ink/10">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">Total Deductions</p>
          <p className="font-display text-xl text-ink mt-1">{formatINR(totals.deductions)}</p>
        </div>
        <div className="bg-paper rounded-sm shadow-card px-5 py-4 border-t-2 border-jade-500">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">Net Salary</p>
          <p className="font-display text-xl text-jade-700 mt-1">{formatINR(totals.net)}</p>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Months</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Basic</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">HRA</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Conv</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Other</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">OT</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Gross</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">PF</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">ESIC</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">PT</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">LWF</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Net Salary</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={13}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={13}>No employees match.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code} · {r.location}</div>
                  </td>
                  <td className="px-4 py-3 font-nums text-ink/70">{r.months_included}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.basic)}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.hra)}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.conveyance)}</td>
                  <td className="px-4 py-3 font-nums">{formatINR(r.other_allowance)}</td>
                  <td className="px-4 py-3 font-nums text-ochre-700">{formatINR(r.ot_amount)}</td>
                  <td className="px-4 py-3 font-nums font-semibold">{formatINR(grossEarnings(r))}</td>
                  <td className="px-4 py-3 font-nums">{r.ded_pf > 0 ? formatINR(r.ded_pf) : "—"}</td>
                  <td className="px-4 py-3 font-nums">{r.ded_esic > 0 ? formatINR(r.ded_esic) : "—"}</td>
                  <td className="px-4 py-3 font-nums">{r.ded_pt > 0 ? formatINR(r.ded_pt) : "—"}</td>
                  <td className="px-4 py-3 font-nums">{r.ded_lwf > 0 ? formatINR(r.ded_lwf) : "—"}</td>
                  <td className="px-4 py-3 font-nums font-semibold text-jade-700">{formatINR(r.total_payable)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
