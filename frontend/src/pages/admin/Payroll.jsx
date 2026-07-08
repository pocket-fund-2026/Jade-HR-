import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../components/MonthPicker.jsx";
import api from "../../lib/api.js";
import { formatINR } from "../../lib/format.js";

const today = new Date();
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function exportCsv(rows, year, month) {
  const headers = [
    "Employee Code", "Name", "Gross (Basic+HRA+Conveyance)", "Per Day Salary",
    "Per Hour Salary", "Present Days", "Absent Days", "Leave Days", "OT Hours", "OT Amount", "Total Payable",
  ];
  const lines = [headers.join(",")];
  for (const r of rows) {
    lines.push([
      r.employee_code,
      `"${r.name}"`,
      r.basic + r.hra + r.conveyance,
      r.per_day_salary,
      r.per_hour_salary,
      r.present_days,
      r.absent_days,
      r.leave_days,
      r.total_ot_hours,
      r.ot_amount,
      r.total_payable,
    ].join(","));
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `jade-hr-payroll-${MONTH_NAMES[month - 1]}-${year}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function Payroll() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [year, month]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Payroll &amp; OT</h2>
          <p className="text-xs text-ink/40 font-nums mt-0.5">
            OT = (Basic + HRA + Conveyance) &divide; days in month &divide; hours &times; OT hours
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => exportCsv(rows, year, month)}
            disabled={!rows.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <Download size={15} /> Export CSV
          </button>
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Employee</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Gross (B+H+C)</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Per Day</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Per Hour</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">OT Hours</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">OT Amount</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Total Payable</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/40 text-center" colSpan={8}>Loading ledger…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/40 text-center" colSpan={8}>No employees yet.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/40 font-nums">{r.employee_code}</div>
                  </td>
                  <td className="px-5 py-3.5 font-nums">{formatINR(r.basic + r.hra + r.conveyance)}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/60">{formatINR(r.per_day_salary)}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/60">{formatINR(r.per_hour_salary)}</td>
                  <td className="px-5 py-3.5 font-nums">{r.total_ot_hours}</td>
                  <td className="px-5 py-3.5 font-nums font-semibold text-ochre-600">{formatINR(r.ot_amount)}</td>
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
