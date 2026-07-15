import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../../components/MonthPicker.jsx";
import api from "../../../lib/api.js";
import { useAuth } from "../../../lib/auth.jsx";
import { formatINR } from "../../../lib/format.js";

const today = new Date();
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Read key (from /api/payroll) vs. write key (hr_salary_structure column,
// see backend/routers/salary_structure.py's LUMPSUM_FIELDS) only differ for
// Arrear — the payroll summary aliases earn_arrear to "arrear" since that's
// also what /api/reports/arrears reports on.
const EDITABLE_COLUMNS = [
  { readKey: "arrear", writeKey: "earn_arrear", label: "Arrear" },
  { readKey: "earn_bonus", writeKey: "earn_bonus", label: "Bonus" },
  { readKey: "earn_leave_encash", writeKey: "earn_leave_encash", label: "Leave Encash" },
  { readKey: "earn_performance_linked_pay", writeKey: "earn_performance_linked_pay", label: "Performance Linked Pay (variable)" },
  { readKey: "ded_loan_int", writeKey: "ded_loan_int", label: "Loan_Int" },
  { readKey: "ded_other_ded", writeKey: "ded_other_ded", label: "OtherDed" },
  { readKey: "ded_salary_advance", writeKey: "ded_salary_advance", label: "Salary Advance" },
  { readKey: "ded_pf_arrear", writeKey: "ded_pf_arrear", label: "PF_Arrear" },
];

async function exportExcel(rows, year, month) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => {
    const row = { "Emp Code": r.employee_code, "Emp Name": r.name };
    for (const c of EDITABLE_COLUMNS) row[c.label] = r[c.readKey] ?? 0;
    row["TDS"] = r.ded_tds ?? 0;
    return row;
  });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Lumpsum");
  XLSX.writeFile(wb, `jade-hr-lumpsum-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}

export default function LumpsumReport() {
  const { can } = useAuth();
  const canEdit = can("salary.edit");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api.get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [year, month]);

  const setCell = (employeeId, readKey, value) => {
    setRows((prev) => prev.map((r) => (r.employee_id === employeeId ? { ...r, [readKey]: value } : r)));
  };

  const saveRow = async (row) => {
    setSavingId(row.employee_id);
    setError("");
    try {
      const body = { period_year: year, period_month: month };
      for (const c of EDITABLE_COLUMNS) body[c.writeKey] = Number(row[c.readKey]) || 0;
      await api.put(`/api/employees/${row.employee_id}/lumpsum`, body);
    } catch (err) {
      setError(err.response?.data?.detail || `Could not save ${row.name}`);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Lumpsum Report</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">
            {canEdit ? "One-off salary adjustments for this pay period — click a figure to edit, it saves on blur." : "One-off salary adjustments for this pay period."}
          </p>
        </div>
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

      {error && <p className="text-sm text-rust-600 mb-4">{error}</p>}

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              {EDITABLE_COLUMNS.map((c) => (
                <th key={c.readKey} className="px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">{c.label}</th>
              ))}
              <th className="px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">
                TDS
                <span className="block normal-case font-normal text-ink/50 text-[10px]">from Tax Declaration</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={EDITABLE_COLUMNS.length + 2}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={EDITABLE_COLUMNS.length + 2}>No employees found.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                  </td>
                  {EDITABLE_COLUMNS.map((c) => (
                    <td key={c.readKey} className="px-2 py-2 text-right">
                      {canEdit ? (
                        <input
                          type="number"
                          className="w-28 rounded-sm border border-ink/15 bg-manila/40 px-2 py-1.5 text-sm font-nums text-right text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 disabled:opacity-50"
                          value={r[c.readKey] ?? 0}
                          disabled={savingId === r.employee_id}
                          onChange={(e) => setCell(r.employee_id, c.readKey, e.target.value)}
                          onBlur={() => saveRow(r)}
                        />
                      ) : (
                        <span className="font-nums pr-2">{formatINR(r[c.readKey] ?? 0)}</span>
                      )}
                    </td>
                  ))}
                  <td className="px-4 py-3 font-nums text-right text-ink/70">{formatINR(r.ded_tds ?? 0)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
