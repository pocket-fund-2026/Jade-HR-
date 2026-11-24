import { Calculator, X } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";
import { formatINR } from "../lib/format.js";

export const ARREAR_REASONS = {
  salary_revision: "Salary revision (retro)",
  unpaid_salary: "Salary not paid earlier",
  attendance_correction: "Attendance / LOP correction",
  bonus_or_incentive: "Bonus / incentive",
  other: "Other",
};
export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Pay period label (year, month) a calendar date falls in: 23rd–22nd cycle.
function currentPayPeriod() {
  const d = new Date();
  return d.getDate() >= 23
    ? (d.getMonth() === 11 ? { year: d.getFullYear() + 1, month: 1 } : { year: d.getFullYear(), month: d.getMonth() + 2 })
    : { year: d.getFullYear(), month: d.getMonth() + 1 };
}

const label = "block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5";
const input = "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

// Arrear entry for Accounts. Pending until approved; only APPROVED arrears
// reach net pay / payslip / bank transfer, in the pay month chosen here.
// Props: employee (preset, optional) | employees (picker list), defaultPeriod.
export default function AddArrearModal({ employee, employees, defaultPeriod, onClose, onSaved }) {
  const start = defaultPeriod || currentPayPeriod();
  const [employeeId, setEmployeeId] = useState(employee?.employee_id || employee?.id || "");
  const [payYear, setPayYear] = useState(start.year);
  const [payMonth, setPayMonth] = useState(start.month);
  const [reason, setReason] = useState("other");
  const [amount, setAmount] = useState("");
  const [tds, setTds] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [approveNow, setApproveNow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [calc, setCalc] = useState({ open: false, old: "", neu: "", result: null, error: "" });

  useEffect(() => {
    if (employee) setEmployeeId(employee.employee_id || employee.id);
  }, [employee]);

  const filteredEmployees = (employees || []).filter((e) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q);
  });

  const runCalc = async () => {
    setCalc((c) => ({ ...c, error: "", result: null }));
    if (!from || !to) return setCalc((c) => ({ ...c, error: "Set the 'Relates to' From and To dates below first" }));
    try {
      const { data } = await api.post("/api/arrears/calculate", {
        old_monthly: Number(calc.old), new_monthly: Number(calc.neu), from_date: from, to_date: to,
      });
      setCalc((c) => ({ ...c, result: data }));
    } catch (err) {
      setCalc((c) => ({ ...c, error: err.response?.data?.detail || "Could not calculate" }));
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!employeeId) return setError("Select an employee");
    const amt = Number(amount);
    if (!amt) return setError("Enter an arrear amount");
    setBusy(true);
    try {
      await api.post("/api/arrears", {
        employee_id: employeeId, pay_year: Number(payYear), pay_month: Number(payMonth),
        arrear_amount: amt, tds_amount: Number(tds) || 0, reason,
        period_from: from || null, period_to: to || null, remarks, approve_now: approveNow,
      });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save — try again");
    } finally {
      setBusy(false);
    }
  };

  const years = [start.year - 1, start.year, start.year + 1];

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50 overflow-y-auto py-8">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-lg p-6 border-t-4 border-ochre-500 relative my-auto">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-ochre-700 mb-1">Add arrear</p>
        <p className="font-display text-lg text-ink mb-5">
          {employee ? (employee.name || `${employee.first_name} ${employee.last_name || ""}`) : "Arrear payment"}
        </p>

        <form onSubmit={submit} className="space-y-4">
          {!employee && (
            <div>
              <label className={label}>Employee</label>
              <input type="text" placeholder="Search name or code…" value={query} onChange={(e) => setQuery(e.target.value)} className={`${input} mb-1.5`} />
              <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} required className={input}>
                <option value="">Select employee…</option>
                {filteredEmployees.map((e) => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name} — {e.employee_code}</option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="arrear_reason" className={label}>Reason</label>
              <select id="arrear_reason" value={reason} onChange={(e) => setReason(e.target.value)} className={input}>
                {Object.entries(ARREAR_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className={label}>Pay in payroll of</label>
              <div className="flex gap-2">
                <select aria-label="Pay month" value={payMonth} onChange={(e) => setPayMonth(e.target.value)} className={input}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select aria-label="Pay year" value={payYear} onChange={(e) => setPayYear(e.target.value)} className={input}>
                  {years.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div>
            <label className={label}>Relates to <span className="text-ink/50 normal-case font-normal">(period the arrear is for — optional)</span></label>
            <div className="grid grid-cols-2 gap-3">
              <input type="date" aria-label="Relates to from" value={from} onChange={(e) => setFrom(e.target.value)} className={`${input} font-nums`} />
              <input type="date" aria-label="Relates to to" value={to} onChange={(e) => setTo(e.target.value)} className={`${input} font-nums`} />
            </div>
          </div>

          <div className="border border-ink/10 rounded-sm">
            <button type="button" onClick={() => setCalc((c) => ({ ...c, open: !c.open }))} className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-ledger-800 hover:bg-manila/50">
              <Calculator size={14} /> Calculate from a salary revision
            </button>
            {calc.open && (
              <div className="p-3 border-t border-ink/10 space-y-3">
                <p className="text-xs text-ink/70">Arrear = (new − old monthly pay) pro-rated by days over each 23rd–22nd pay period in the “Relates to” range.</p>
                <div className="grid grid-cols-2 gap-3">
                  <input type="number" min="0" placeholder="Old monthly pay" value={calc.old} onChange={(e) => setCalc((c) => ({ ...c, old: e.target.value }))} className={`${input} font-nums`} />
                  <input type="number" min="0" placeholder="New monthly pay" value={calc.neu} onChange={(e) => setCalc((c) => ({ ...c, neu: e.target.value }))} className={`${input} font-nums`} />
                </div>
                <button type="button" onClick={runCalc} className="text-xs font-semibold bg-ledger-800 text-manila px-3 py-1.5 rounded-sm hover:bg-ledger-700">Calculate</button>
                {calc.error && <p className="text-xs text-rust-500">{calc.error}</p>}
                {calc.result && (
                  <div className="text-xs">
                    <table className="w-full tabular-nums">
                      <tbody>
                        {calc.result.lines.map((l) => (
                          <tr key={`${l.pay_year}-${l.pay_month}`} className="border-b border-ink/[0.06]">
                            <td className="py-1">{MONTHS[l.pay_month - 1]} {l.pay_year}</td>
                            <td className="py-1 text-ink/70">{l.days}/{l.period_days} days</td>
                            <td className="py-1 text-right font-nums">{formatINR(l.amount)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="flex justify-between items-center pt-2">
                      <span className="font-semibold">Total {formatINR(calc.result.total)}</span>
                      <button type="button" onClick={() => { setAmount(String(calc.result.total)); setReason("salary_revision"); }} className="font-semibold text-jade-700 hover:underline">Use this amount</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="arrear_amount" className={label}>Arrear amount (₹)</label>
              <input id="arrear_amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} font-nums`} required />
            </div>
            <div>
              <label htmlFor="arrear_tds" className={label}>TDS on it (₹)</label>
              <input id="arrear_tds" type="number" step="0.01" min="0" value={tds} onChange={(e) => setTds(e.target.value)} className={`${input} font-nums`} />
            </div>
          </div>
          <p className="text-[11px] text-ink/60 -mt-2">No PF/ESIC is charged on arrears. TDS is not recalculated automatically — enter what should be withheld. A negative amount recovers an overpayment.</p>

          <div>
            <label htmlFor="arrear_remarks" className={label}>Remarks</label>
            <textarea id="arrear_remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="e.g. Increment effective 1 Aug, applied in October payroll" className={`${input} min-h-[60px]`} />
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={approveNow} onChange={(e) => setApproveNow(e.target.checked)} className="w-4 h-4 accent-jade-600" />
            Approve immediately <span className="text-ink/60 text-xs">(otherwise it waits as Pending and is not paid)</span>
          </label>

          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-ink/70 hover:text-ink px-2">Cancel</button>
            <button type="submit" disabled={busy} className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors">
              {busy ? "Saving…" : "Save arrear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
