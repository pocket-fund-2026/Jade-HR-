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
    "Bank Name": r.bank_name,
    "Account Number": r.bank_account_no,
    "IFSC": r.bank_ifsc,
    "Net Salary": r.total_payable,
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bank Transfer");
  XLSX.writeFile(wb, `jade-hr-bank-transfer-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}

export default function BankTransferReport() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [year, month]);

  const byTransfer = rows.filter((r) => r.payment_mode === "Bank Transfer" || !r.payment_mode);
  const others = rows.filter((r) => r.payment_mode && r.payment_mode !== "Bank Transfer");
  const total = byTransfer.reduce((s, r) => s + r.total_payable, 0);
  const missingDetails = byTransfer.filter((r) => !r.bank_account_no || !r.bank_ifsc);

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <h2 className="font-display text-2xl text-ink">Bank Transfer — Salary</h2>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => exportExcel(byTransfer, year, month)}
            disabled={!byTransfer.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card px-5 py-4 border-t-2 border-jade-500 mb-6 max-w-xs">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">Total to transfer ({byTransfer.length} employees)</p>
        <p className="font-display text-2xl text-jade-700 mt-1">{formatINR(total)}</p>
      </div>

      {missingDetails.length > 0 && (
        <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mb-4">
          {missingDetails.length} employee{missingDetails.length === 1 ? "" : "s"} on Bank Transfer {missingDetails.length === 1 ? "is" : "are"} missing an account number or IFSC — add these on the employee's Official tab.
        </p>
      )}

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Bank</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Account No</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">IFSC</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Net Salary</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={5}>Loading…</td></tr>
            ) : byTransfer.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={5}>No employees on Bank Transfer.</td></tr>
            ) : (
              byTransfer.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                  </td>
                  <td className="px-4 py-3 text-ink/80">{r.bank_name || "—"}</td>
                  <td className="px-4 py-3 font-nums text-ink/80">{r.bank_account_no || "—"}</td>
                  <td className="px-4 py-3 font-nums text-ink/80">{r.bank_ifsc || "—"}</td>
                  <td className="px-4 py-3 font-nums font-semibold text-jade-700">{formatINR(r.total_payable)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {others.length > 0 && (
        <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
          <p className="px-4 pt-3 pb-2 text-xs font-semibold uppercase tracking-wider text-ink/70">Paid by Cheque / Cash (not part of the transfer file)</p>
          <table className="w-full text-sm">
            <tbody>
              {others.map((r) => (
                <tr key={r.employee_id} className="border-t border-ink/[0.06]">
                  <td className="px-4 py-2.5 text-ink font-medium">{r.name} <span className="text-ink/70 font-nums text-xs">({r.employee_code})</span></td>
                  <td className="px-4 py-2.5 text-ink/70">{r.payment_mode}</td>
                  <td className="px-4 py-2.5 font-nums text-right">{formatINR(r.total_payable)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
