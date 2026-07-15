import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../../components/MonthPicker.jsx";
import api from "../../../lib/api.js";
import { formatFullDate, formatINR } from "../../../lib/format.js";

const today = new Date();
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// FPF (Family Pension Fund, EPS's pre-1996 name) and EDLI Admin Charges are
// kept as columns for compatibility with the statutory PF sheet template,
// but neither is computed by this system: FPF has no live equivalent left
// in the Act, and EDLI Admin Charges was reduced to Nil by EPFO w.e.f.
// 01-04-2017 — both are always 0 here rather than guessed.
function pfRow(r) {
  const employeeTotal = r.ded_pf + r.ded_vpf;
  const employerTotal = r.pf_employer_epf + r.pf_employer_eps;
  return { ...r, fpf: 0, employeeTotal, employerTotal, edliAdminCharges: 0 };
}

async function exportExcel(rows, year, month) {
  const XLSX = await import("xlsx");
  const data = rows.map((r, i) => {
    const row = pfRow(r);
    return {
      "Sr. No.": i + 1,
      "PF No.": row.pf_no,
      "PF UAN": row.uan_no,
      "Employee Code": row.employee_code,
      "Employee Name": row.name,
      "Join Date": formatFullDate(row.date_of_joining),
      "Resign Date": formatFullDate(row.exit_date),
      "Gross Wages": row.gross_salary,
      "Paid Days": row.paid_days,
      "PF Wages": row.pf_wages,
      "EPS Wages": row.eps_wages,
      "Employee EPF": row.ded_pf,
      "FPF": row.fpf,
      "VPF": row.ded_vpf,
      "Total": row.employeeTotal,
      "Employer EPF": row.pf_employer_epf,
      "EPS": row.pf_employer_eps,
      "Employer Total": row.employerTotal,
      "PF Admin Charges": row.pf_admin_charges,
      "EDLI Wages": row.edli_wages,
      "EDLI Charges": row.pf_edli_charges,
      "EDLI Admin Charges": row.edliAdminCharges,
    };
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PF Sheet");
  XLSX.writeFile(wb, `jade-hr-pf-sheet-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}

export default function PfReport() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data.filter((r) => r.pf_wages > 0)))
      .finally(() => setLoading(false));
  }, [year, month]);

  const totals = rows.reduce((acc, r) => ({
    wages: acc.wages + r.pf_wages,
    employeePf: acc.employeePf + r.ded_pf,
    vpf: acc.vpf + r.ded_vpf,
    eps: acc.eps + r.pf_employer_eps,
    epf: acc.epf + r.pf_employer_epf,
    edli: acc.edli + r.pf_edli_charges,
    admin: acc.admin + r.pf_admin_charges,
  }), { wages: 0, employeePf: 0, vpf: 0, eps: 0, epf: 0, edli: 0, admin: 0 });
  const totalDeposit = totals.employeePf + totals.vpf + totals.eps + totals.epf + totals.edli + totals.admin;

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <h2 className="font-display text-2xl text-ink">PF Sheet &amp; Challan</h2>
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
          <p className="text-xs font-semibold uppercase tracking-wider text-manila/60 mb-3">Challan — {rows.length} employees</p>
          <div className="flex justify-between text-sm text-manila/60"><span>Employee PF (12%)</span><span className="font-nums text-manila">{formatINR(totals.employeePf)}</span></div>
          <div className="flex justify-between text-sm text-manila/60"><span>VPF</span><span className="font-nums text-manila">{formatINR(totals.vpf)}</span></div>
          <div className="flex justify-between text-sm text-manila/60"><span>Employer EPS (8.33%, capped ₹15,000)</span><span className="font-nums text-manila">{formatINR(totals.eps)}</span></div>
          <div className="flex justify-between text-sm text-manila/60"><span>Employer EPF</span><span className="font-nums text-manila">{formatINR(totals.epf)}</span></div>
          <div className="flex justify-between text-sm text-manila/60"><span>EDLI Charges (0.5%, capped ₹15,000)</span><span className="font-nums text-manila">{formatINR(totals.edli)}</span></div>
          <div className="flex justify-between text-sm text-manila/60"><span>PF Admin Charges (0.5%)</span><span className="font-nums text-manila">{formatINR(totals.admin)}</span></div>
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
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Sr. No.</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">PF No.</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">PF UAN</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Join Date</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Resign Date</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Gross Wages</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Paid Days</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">PF Wages</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">EPS Wages</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee EPF</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">FPF</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">VPF</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Total</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employer EPF</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">EPS</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employer Total</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">PF Admin Charges</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">EDLI Wages</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">EDLI Charges</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">EDLI Admin Charges</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={21}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={21}>No PF-applicable employees this month.</td></tr>
            ) : (
              rows.map((raw, i) => {
                const r = pfRow(raw);
                return (
                  <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                    <td className="px-4 py-3 font-nums text-ink/70">{i + 1}</td>
                    <td className="px-4 py-3 font-nums text-ink/80">{r.pf_no || "—"}</td>
                    <td className="px-4 py-3 font-nums text-ink/80">{r.uan_no || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="text-ink font-medium">{r.name}</span>
                      <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                    </td>
                    <td className="px-4 py-3 font-nums text-ink/80">{formatFullDate(r.date_of_joining)}</td>
                    <td className="px-4 py-3 font-nums text-ink/80">{formatFullDate(r.exit_date)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.gross_salary)}</td>
                    <td className="px-4 py-3 font-nums">{r.paid_days}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.pf_wages)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.eps_wages)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.ded_pf)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.fpf)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.ded_vpf)}</td>
                    <td className="px-4 py-3 font-nums font-semibold">{formatINR(r.employeeTotal)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.pf_employer_epf)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.pf_employer_eps)}</td>
                    <td className="px-4 py-3 font-nums font-semibold">{formatINR(r.employerTotal)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.pf_admin_charges)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.edli_wages)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.pf_edli_charges)}</td>
                    <td className="px-4 py-3 font-nums">{formatINR(r.edliAdminCharges)}</td>
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
