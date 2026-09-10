import { X } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

function Field({ label, required, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
        {label} {required && <span className="text-rust-500 normal-case font-normal">*Required</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";
const readOnlyCls =
  "w-full rounded-sm border border-ink/10 bg-ink/[0.04] px-3 py-2.5 text-sm text-ink/70";

export default function LoanRequestModal({ onClose, onSubmitted }) {
  const { user } = useAuth();
  const [amount, setAmount] = useState("");
  const [repaymentMonths, setRepaymentMonths] = useState(1);
  const [reason, setReason] = useState("");
  const [guarantorName, setGuarantorName] = useState("");
  const [guarantorEmployeeCode, setGuarantorEmployeeCode] = useState("");
  const [guarantorDetails, setGuarantorDetails] = useState("");
  const [pdcDetails, setPdcDetails] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (Number(amount) <= 0) {
      setError("Amount must be greater than 0");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/me/loan-requests", {
        department: user?.department || "",
        amount: Number(amount),
        repayment_months: Number(repaymentMonths),
        reason,
        guarantor_name: guarantorName,
        guarantor_employee_code: guarantorEmployeeCode,
        guarantor_details: guarantorDetails,
        pdc_details: pdcDetails,
      });
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not submit — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50 overflow-y-auto py-8">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-lg p-6 border-t-4 border-jade-500 relative my-auto">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">Salary advance</p>
        <p className="font-display text-lg text-ink mb-5">Loan Request</p>

        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Employee Details</p>
            <Field label="Employee Code">
              <input className={readOnlyCls} value={user?.employee_code || ""} disabled />
            </Field>
            <Field label="Name">
              <input className={readOnlyCls} value={`${user?.first_name || ""} ${user?.last_name || ""}`.trim()} disabled />
            </Field>
            <Field label="Department">
              <input className={readOnlyCls} value={user?.department || ""} disabled />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Loan Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Amount (₹)" required>
                <input
                  type="number" min="1" step="1" required className={`${inputCls} font-nums`}
                  value={amount} onChange={(e) => setAmount(e.target.value)}
                />
              </Field>
              <Field label="Repayment (months)" required>
                <input
                  type="number" min="1" step="1" required className={`${inputCls} font-nums`}
                  value={repaymentMonths} onChange={(e) => setRepaymentMonths(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Reason" required>
              <textarea
                required className={`${inputCls} min-h-[70px]`}
                value={reason} onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Guarantor Details</p>
            <Field label="Guarantor name">
              <input className={inputCls} value={guarantorName} onChange={(e) => setGuarantorName(e.target.value)} />
            </Field>
            <Field label="Guarantor employee code">
              <input className={inputCls} value={guarantorEmployeeCode} onChange={(e) => setGuarantorEmployeeCode(e.target.value)} />
            </Field>
            <Field label="Guarantor details (dept / contact)">
              <input className={inputCls} value={guarantorDetails} onChange={(e) => setGuarantorDetails(e.target.value)} />
            </Field>
            <Field label="PDC / cheque security details (optional)">
              <input className={inputCls} value={pdcDetails} onChange={(e) => setPdcDetails(e.target.value)} />
            </Field>
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
              {busy ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
