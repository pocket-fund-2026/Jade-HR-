import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../../lib/api.js";
import { formatDate } from "../../../lib/format.js";

const LEAVE_LABELS = {
  casual: "Casual", sick: "Sick", earned: "PL", unpaid: "Unpaid", other: "Other",
  paternity: "Paternity", maternity: "Maternity", compassionate: "Compassionate", comp_off: "Comp-Off",
};

const today = new Date();

async function exportExcel(report) {
  const XLSX = await import("xlsx");
  const data = report.rows.map((r) => ({
    Date: r.date,
    Description: r.description,
    Cr: r.cr || "",
    Debit: r.debit || "",
    "Adjusted in Payslip": r.adjusted_in_payslip || "",
    "Leave Approved": r.leave_approved || "",
  }));
  data.push({ Date: "", Description: "TOTAL ->", Cr: report.total_cr, Debit: report.total_debit, "Adjusted in Payslip": report.total_adjusted_in_payslip, "Leave Approved": report.total_leave_approved });
  data.push({ Date: "", Description: "CLOSING BALANCE", Cr: report.closing_balance, Debit: "", "Adjusted in Payslip": "", "Leave Approved": "" });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leave Ledger");
  XLSX.writeFile(wb, `jade-hr-leave-ledger-${report.employee_code}-${report.year}.xlsx`);
}

export default function LeaveLedgerReport() {
  const [employees, setEmployees] = useState([]);
  const [status, setStatus] = useState("both");
  const [employeeId, setEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState("earned");
  const [year, setYear] = useState(today.getFullYear());
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/employees").then(({ data }) => setEmployees(data));
  }, []);

  const filteredEmployees = employees.filter((e) => status === "both" || e.is_active === (status === "active"));

  const search = () => {
    if (!employeeId) {
      setError("Select an employee to view their detailed leave ledger.");
      return;
    }
    setLoading(true);
    setError("");
    api.get(`/api/leave-ledger/report/${employeeId}`, { params: { leave_type: leaveType, year } })
      .then(({ data }) => setReport(data))
      .catch((err) => setError(err.response?.data?.detail || "Could not load report"))
      .finally(() => setLoading(false));
  };

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <h2 className="font-display text-2xl text-ink mt-2 mb-6">Leave Ledger — Leave Detailed Report</h2>

      <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Active / Inactive</label>
            <div className="flex rounded-sm border border-ink/15 overflow-hidden text-xs">
              {["active", "inactive", "both"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={`flex-1 px-3 py-2 font-semibold capitalize transition-colors ${status === s ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee</label>
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
            >
              <option value="">All Employees are Selected</option>
              {filteredEmployees.map((e) => (
                <option key={e.id} value={e.id}>{e.employee_code} — {e.first_name} {e.last_name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Leave Type</label>
            <select
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
              className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
            >
              {Object.entries(LEAVE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink font-nums focus:outline-none focus:ring-2 focus:ring-jade-500"
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={search}
            className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
          >
            Search
          </button>
        </div>
        {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mt-3">{error}</p>}
      </div>

      {loading && <p className="text-ink/70">Loading…</p>}

      {report && !loading && (
        <div className="bg-paper rounded-sm shadow-card p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <p className="text-sm text-ink">
              <span className="font-semibold">Emp Code:</span> {report.employee_code}
              <span className="ml-4 font-semibold">Emp Name:</span> {report.employee_name}
              <span className="ml-4 font-semibold">Leave Type:</span> {LEAVE_LABELS[report.leave_type] || report.leave_type}
            </p>
            <button
              onClick={() => exportExcel(report)}
              className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 transition-colors"
            >
              <FileSpreadsheet size={15} /> Excel
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left sticky top-0 z-10 bg-paper">
                <tr className="border-b-2 border-ink/10">
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Date</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Description</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Cr</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Debit</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Adjusted in Payslip</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Leave Approved</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-ink/[0.06]">
                  <td className="px-3 py-2 font-nums text-ink/70">01-Jan-{report.year}</td>
                  <td className="px-3 py-2 text-ink">Opening Balance</td>
                  <td className="px-3 py-2 font-nums text-right">{report.opening_balance}</td>
                  <td className="px-3 py-2 font-nums text-right">—</td>
                  <td className="px-3 py-2 font-nums text-right">—</td>
                  <td className="px-3 py-2 font-nums text-right">—</td>
                </tr>
                {report.rows.map((r, i) => (
                  <tr key={i} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                    <td className="px-3 py-2 font-nums text-ink/70">{formatDate(r.date)}</td>
                    <td className="px-3 py-2 text-ink">{r.description}</td>
                    <td className="px-3 py-2 font-nums text-right">{r.cr || "—"}</td>
                    <td className="px-3 py-2 font-nums text-right">{r.debit || "—"}</td>
                    <td className="px-3 py-2 font-nums text-right">{r.adjusted_in_payslip || "—"}</td>
                    <td className="px-3 py-2 font-nums text-right">{r.leave_approved || "—"}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-ink/10 font-semibold">
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5">TOTAL -&gt;</td>
                  <td className="px-3 py-2.5 font-nums text-right">{report.total_cr}</td>
                  <td className="px-3 py-2.5 font-nums text-right">{report.total_debit}</td>
                  <td className="px-3 py-2.5 font-nums text-right">{report.total_adjusted_in_payslip}</td>
                  <td className="px-3 py-2.5 font-nums text-right">{report.total_leave_approved}</td>
                </tr>
                <tr className="font-semibold text-jade-700">
                  <td className="px-3 py-2.5"></td>
                  <td className="px-3 py-2.5">
                    CLOSING BALANCE
                    <div className="text-[11px] font-normal text-ink/60">(higher value taken between Approved and Payslip)</div>
                  </td>
                  <td className="px-3 py-2.5 font-nums text-right" colSpan={4}>{report.closing_balance}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
