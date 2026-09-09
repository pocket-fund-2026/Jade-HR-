import { X } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";
import { LEAVE_LABELS, selectableLeaveTypes } from "../lib/leaveTypes.js";

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  return days > 0 ? days : 0;
}

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

// `onBehalfOf` (an employee row: {id, first_name, last_name, employee_code,
// employee_category}) switches this from the normal employee self-service
// modal into HR's Red Card exception path — files the request under that
// employee instead of the caller, and skips the Red Card block (filing it
// IS the documented management exception).
export default function LeaveRequestModal({ onClose, onSubmitted, onBehalfOf }) {
  const { user } = useAuth();
  const subject = onBehalfOf ?? user;
  const isCorporate = subject?.employee_category === "corporate";
  const availableTypes = selectableLeaveTypes(isCorporate);
  const [leaveType, setLeaveType] = useState("paid");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Approver is resolved server-side from the employee's reporting manager
  // (hr_employees.leave_approver_id / hr_employee_profile.reporting_to_id) —
  // shown here read-only for confirmation, never submitted, unlike Work
  // Absence's approver fields which the employee fills in by hand because
  // hr_absence_requests has no equivalent auto-resolution.
  const [approverName, setApproverName] = useState("");
  useEffect(() => {
    if (onBehalfOf || !user?.id) return;
    api.get(`/api/employees/${user.id}/profile`).then(({ data }) => {
      if (data.reporting_to) setApproverName(data.reporting_to);
    }).catch(() => {});
  }, [user?.id, onBehalfOf]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (endDate < startDate) {
      setError("End date must be on or after the start date");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/me/leave-requests", {
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason,
        ...(onBehalfOf ? { employee_id: onBehalfOf.id } : {}),
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
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">
          {onBehalfOf ? "Red Card exception" : "Leave Application"}
        </p>
        <p className="font-display text-lg text-ink mb-5">
          {onBehalfOf
            ? `Filing for ${onBehalfOf.first_name} ${onBehalfOf.last_name || ""} (${onBehalfOf.employee_code})`
            : "New leave request"}
        </p>

        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Employee Details</p>
            <Field label="Dept." required>
              <input className={readOnlyCls} value={subject?.department || ""} disabled />
            </Field>
            <Field label="Employee Code">
              <input className={readOnlyCls} value={subject?.employee_code || ""} disabled />
            </Field>
            <Field label="Name" required>
              <input className={readOnlyCls} value={`${subject?.first_name || ""} ${subject?.last_name || ""}`.trim()} disabled />
            </Field>
            <Field label="Email" required>
              <input className={readOnlyCls} value={subject?.email || ""} disabled />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Details</p>
            <Field label="Type of leave" required>
              <select
                className={inputCls}
                value={leaveType}
                onChange={(e) => setLeaveType(e.target.value)}
              >
                {availableTypes.map((value) => (
                  <option key={value} value={value}>{LEAVE_LABELS[value]}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="From" required>
                <input
                  type="date" required className={`${inputCls} font-nums`}
                  value={startDate} onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="To" required>
                <input
                  type="date" required className={`${inputCls} font-nums`}
                  value={endDate} onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Number of days">
              <input type="number" className={`${readOnlyCls} font-nums`} value={daysBetween(startDate, endDate)} disabled />
            </Field>
            <Field label="Details" required>
              <textarea
                required className={`${inputCls} min-h-[70px]`}
                value={reason} onChange={(e) => setReason(e.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Approver Details</p>
            <p className="text-xs text-ink/70 -mt-1">
              Routed automatically to your reporting manager on file — contact HR if this looks wrong.
            </p>
            <Field label="Name">
              <input className={readOnlyCls} value={approverName || "Not set — contact HR"} disabled />
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
              {busy ? "Submitting…" : onBehalfOf ? "File exception" : "Submit to admin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
