import { X } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";

const today = new Date().toISOString().slice(0, 10);

// Quick one-off arrear entry — POSTs to /api/arrears (hr_arrears), which
// doesn't require the employee to already have a full Salary Structure
// revision on file (unlike hr_salary_structure's earn_arrear). Used from
// the Arrear Details report (employee picker shown) and the Salary Paid
// Report (employee preset, for "salary not paid last month" cases).
export default function AddArrearModal({ employee, employees, onClose, onSaved }) {
  const [employeeId, setEmployeeId] = useState(employee?.employee_id || employee?.id || "");
  const [effectiveDate, setEffectiveDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (employee) setEmployeeId(employee.employee_id || employee.id);
  }, [employee]);

  const filteredEmployees = (employees || []).filter((e) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q);
  });

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!employeeId) {
      setError("Select an employee");
      return;
    }
    const amt = Number(amount);
    if (!amt) {
      setError("Enter an arrear amount");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/arrears", {
        employee_id: employeeId,
        effective_date: effectiveDate,
        arrear_amount: amt,
        remarks,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50 overflow-y-auto py-8">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-md p-6 border-t-4 border-ochre-500 relative my-auto">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-ochre-700 mb-1">Add arrear</p>
        <p className="font-display text-lg text-ink mb-5">
          {employee ? (employee.name || `${employee.first_name} ${employee.last_name || ""}`) : "One-off arrear payment"}
        </p>

        <form onSubmit={submit} className="space-y-4">
          {!employee && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee</label>
              <input
                type="text"
                placeholder="Search name or code…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink mb-1.5 focus:outline-none focus:ring-2 focus:ring-jade-500"
              />
              <select
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                required
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              >
                <option value="">Select employee…</option>
                {filteredEmployees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.first_name} {e.last_name} — {e.employee_code}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label htmlFor="arrear_effective_date" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
              Effective date <span className="text-ink/50 normal-case font-normal">(month it belongs to)</span>
            </label>
            <input
              id="arrear_effective_date"
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              required
            />
          </div>

          <div>
            <label htmlFor="arrear_amount" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Arrear amount (₹)</label>
            <input
              id="arrear_amount"
              type="number"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              required
            />
          </div>

          <div>
            <label htmlFor="arrear_remarks" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Remarks</label>
            <textarea
              id="arrear_remarks"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="e.g. Salary for August not paid, cleared as arrear"
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 min-h-[70px]"
            />
          </div>

          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-ink/70 hover:text-ink px-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
            >
              {busy ? "Saving…" : "Save arrear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
