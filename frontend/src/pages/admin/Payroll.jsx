import { FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../components/MonthPicker.jsx";
import api from "../../lib/api.js";
import { formatINR } from "../../lib/format.js";

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
    "Base Day": r.days_in_month,
    "Present": r.present_days,
    "Weekoff": r.weekoff_days,
    "PL": r.pl_days,
    "Absent": r.absent_days,
    "Paid Days": r.paid_days,
    "Late": r.late_days,
    "On Time": r.on_time_days,
    "Gross (Basic+HRA+Conveyance)": r.basic + r.hra + r.conveyance,
    "Per Day Salary": r.per_day_salary,
    "Per Hour Salary": r.per_hour_salary,
    "OT Hours": r.total_ot_hours,
    "OT Amount": r.ot_amount,
    "Total Payable": r.total_payable,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Payroll");
  XLSX.writeFile(wb, `jade-hr-payroll-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}

export default function Payroll() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState("all");

  useEffect(() => {
    setLoading(true);
    api
      .get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [year, month]);

  const locations = useMemo(
    () => [...new Set(rows.map((r) => r.location).filter(Boolean))].sort(),
    [rows],
  );
  const filtered = useMemo(
    () => (location === "all" ? rows : rows.filter((r) => r.location === location)),
    [rows, location],
  );

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Payroll &amp; OT</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">
            OT = (Basic + HRA + Conveyance) &divide; days in month &divide; hours &times; OT hours
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            <option value="all">All locations</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
          <button
            onClick={() => exportExcel(filtered, year, month)}
            disabled={!filtered.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Base Day</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Present</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Weekoff</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">PL</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Absent</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Paid Days</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Late</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">On Time</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Gross (B+H+C)</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Per Day</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Per Hour</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">OT Hours</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">OT Amount</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Total Payable</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={16}>Loading ledger…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={16}>No employees match.</td></tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{r.name}</span>
                    {r.red_card && (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-rust-500 bg-rust-50 border border-rust-500/40 rounded-sm px-1.5 py-0.5">
                        Red Card
                      </span>
                    )}
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                  </td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{r.days_in_month}</td>
                  <td className="px-5 py-3.5 font-nums text-jade-700">{r.present_days}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{r.weekoff_days}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{r.pl_days}</td>
                  <td className="px-5 py-3.5 font-nums text-rust-500">{r.absent_days}</td>
                  <td className="px-5 py-3.5 font-nums font-semibold text-ink">{r.paid_days}</td>
                  <td className="px-5 py-3.5 font-nums text-rust-500">{r.late_days}</td>
                  <td className="px-5 py-3.5 font-nums text-jade-700">{r.on_time_days}</td>
                  <td className="px-5 py-3.5 font-nums">{formatINR(r.basic + r.hra + r.conveyance)}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatINR(r.per_day_salary)}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatINR(r.per_hour_salary)}</td>
                  <td className="px-5 py-3.5 font-nums">{r.total_ot_hours}</td>
                  <td className="px-5 py-3.5 font-nums font-semibold text-ochre-700">{formatINR(r.ot_amount)}</td>
                  <td className="px-5 py-3.5 font-nums font-semibold text-ink">{formatINR(r.total_payable)}</td>
                  <td className="px-5 py-3.5">
                    <Link
                      to={`/admin/payroll/${r.employee_id}?year=${year}&month=${month}`}
                      className="text-jade-600 hover:text-jade-700 hover:underline text-xs font-medium"
                    >
                      Details
                    </Link>
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
