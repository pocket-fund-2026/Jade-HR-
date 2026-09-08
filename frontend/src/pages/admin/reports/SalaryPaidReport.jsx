import { ArrowLeft, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import AddArrearModal from "../../../components/AddArrearModal.jsx";
import MonthPicker from "../../../components/MonthPicker.jsx";
import api from "../../../lib/api.js";
import { formatDate } from "../../../lib/format.js";

const today = new Date();

export default function SalaryPaidReport() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [arrearFor, setArrearFor] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/api/reports/salary-paid", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [year, month]);

  const togglePaid = async (row) => {
    setRows((rs) => rs.map((r) => (r.employee_id === row.employee_id ? { ...r, paid: !row.paid } : r)));
    try {
      await api.put(`/api/reports/salary-paid/${row.employee_id}`, { year, month, paid: !row.paid });
    } catch {
      setRows((rs) => rs.map((r) => (r.employee_id === row.employee_id ? { ...r, paid: row.paid } : r)));
    }
  };

  const paidCount = rows.filter((r) => r.paid).length;

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-2">
        <div>
          <h2 className="font-display text-2xl text-ink">Salary Paid Report</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">
            Check off each employee once their salary for the month is paid out. If a past month wasn't paid, add it as an arrear.
          </p>
        </div>
        <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
      </div>

      <div className="bg-ledger-800 rounded-sm shadow-card p-6 relative overflow-hidden mb-6">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="relative flex justify-between items-baseline">
          <span className="font-display text-manila text-lg">Paid this month</span>
          <span className="font-nums font-semibold text-3xl text-manila">{paidCount} / {rows.length}</span>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Location</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Arrear logged this month</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Marked</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-center">Paid</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={6}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={6}>No active employees.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className={`border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors ${!r.paid ? "bg-rust-50/40" : ""}`}>
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                  </td>
                  <td className="px-4 py-3 text-ink/70">{r.location || "—"}</td>
                  <td className="px-4 py-3 font-nums">
                    {r.arrear_this_month ? (
                      <span className="text-jade-700 font-semibold">₹{r.arrear_this_month.toLocaleString("en-IN")}</span>
                    ) : (
                      <span className="text-ink/40">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/70 text-xs">{r.marked_at ? formatDate(r.marked_at) : "—"}</td>
                  <td className="px-4 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={r.paid}
                      onChange={() => togglePaid(r)}
                      aria-label={`Mark ${r.name} paid for this month`}
                      className="w-4 h-4 accent-jade-600 cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-3">
                    {!r.paid && (
                      <button
                        onClick={() => setArrearFor(r)}
                        className="flex items-center gap-1 text-ochre-700 hover:text-ochre-800 hover:underline text-xs font-medium"
                      >
                        <Plus size={12} /> Add Arrear
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {arrearFor && (
        <AddArrearModal
          employee={arrearFor}
          onClose={() => setArrearFor(null)}
          onSaved={() => { setArrearFor(null); load(); }}
        />
      )}
    </div>
  );
}
