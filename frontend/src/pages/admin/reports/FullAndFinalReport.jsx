import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../../lib/api.js";
import { formatFullDate, formatINR } from "../../../lib/format.js";

export default function FullAndFinalReport() {
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [settlement, setSettlement] = useState(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSettlement, setLoadingSettlement] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/reports/full-and-final/employees")
      .then(({ data }) => {
        setEmployees(data);
        if (data.length) setEmployeeId(data[0].employee_id);
      })
      .finally(() => setLoadingList(false));
  }, []);

  useEffect(() => {
    if (!employeeId) return;
    setLoadingSettlement(true);
    setError("");
    setSettlement(null);
    api.get(`/api/reports/full-and-final/${employeeId}`)
      .then(({ data }) => setSettlement(data))
      .catch((err) => setError(err.response?.data?.detail || "Failed to load settlement"))
      .finally(() => setLoadingSettlement(false));
  }, [employeeId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter(
      (e) => e.name.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q),
    );
  }, [employees, search]);

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <h2 className="font-display text-2xl text-ink mt-2 mb-1">Payslip Full &amp; Final</h2>
      <p className="text-xs text-ink/70 mb-6">Last pay-period payslip, unused earned-leave encashment, and gratuity.</p>

      {loadingList ? (
        <p className="text-ink/70">Loading…</p>
      ) : employees.length === 0 ? (
        <p className="text-sm text-ink/70">No employees found.</p>
      ) : (
        <>
          <div className="mb-6 max-w-md space-y-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or employee code…"
              className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
            />
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee</label>
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              >
                {filtered.length === 0 ? (
                  <option value="">No matches</option>
                ) : (
                  filtered.map((e) => (
                    <option key={e.employee_id} value={e.employee_id}>
                      {e.name} ({e.employee_code}) — {e.employee_status || (e.is_active ? "Active" : "Inactive")}
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {loadingSettlement ? (
            <p className="text-ink/70">Computing settlement…</p>
          ) : error ? (
            <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>
          ) : settlement ? (
            <div className="space-y-6 max-w-2xl">
              {settlement.is_estimate && (
                <div className="bg-ochre-50 border border-ochre-400/40 rounded-sm px-4 py-3 text-sm text-ink/80">
                  <strong>Estimate</strong> — no Exit Date or Scheduled Exit Date is on file for this employee, so this
                  is calculated as if they were leaving today ({formatFullDate(settlement.reference_date)}). Set an
                  Exit Date on the employee's Dates tab once it's confirmed for the real settlement figure.
                </div>
              )}
              <div className="bg-paper rounded-sm shadow-card p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">Employee</p>
                    <p className="text-sm text-ink font-medium mt-0.5">{settlement.name} ({settlement.employee_code})</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">
                      {settlement.is_estimate ? "As-of Date" : "Exit Date"}
                    </p>
                    <p className="text-sm text-ink font-medium mt-0.5">{formatFullDate(settlement.reference_date)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">Status</p>
                    <p className="text-sm text-ink font-medium mt-0.5">{settlement.employee_status || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">Reason</p>
                    <p className="text-sm text-ink font-medium mt-0.5">{settlement.reason_of_leaving || "—"}</p>
                  </div>
                </div>
              </div>

              <div className="bg-paper rounded-sm shadow-card overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    <tr className="border-b border-ink/[0.06]">
                      <td className="px-5 py-3 text-ink/80">Last pay-period net salary (payslip)</td>
                      <td className="px-5 py-3 text-right font-nums text-ink">{formatINR(settlement.last_payslip_net)}</td>
                    </tr>
                    <tr className="border-b border-ink/[0.06]">
                      <td className="px-5 py-3 text-ink/80">Unused earned leave — {settlement.leave_balance_days} day{settlement.leave_balance_days === 1 ? "" : "s"} × {formatINR(settlement.per_day_salary)}/day</td>
                      <td className="px-5 py-3 text-right font-nums text-ink">{formatINR(settlement.leave_encashment)}</td>
                    </tr>
                    <tr className="border-b border-ink/[0.06]">
                      <td className="px-5 py-3 text-ink/80">
                        Gratuity — {settlement.gratuity.years_of_service} year{settlement.gratuity.years_of_service === 1 ? "" : "s"} of service
                        {!settlement.gratuity.eligible && <span className="text-ink/60 italic"> (not eligible — under 5 years)</span>}
                        {settlement.gratuity.capped && <span className="text-ochre-700 italic"> (capped at the ₹20L statutory ceiling)</span>}
                      </td>
                      <td className="px-5 py-3 text-right font-nums text-ink">{formatINR(settlement.gratuity.gratuity_amount)}</td>
                    </tr>
                    <tr className="border-t-2 border-ink/10 font-semibold">
                      <td className="px-5 py-3">Total Settlement</td>
                      <td className="px-5 py-3 text-right font-nums text-jade-700">{formatINR(settlement.total_settlement)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
