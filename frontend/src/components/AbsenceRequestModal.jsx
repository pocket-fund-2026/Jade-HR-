import { Paperclip, X } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

function daysBetween(start, end) {
  if (!start || !end) return 0;
  const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  return days > 0 ? days : 0;
}

// Absences may only be reported for the CURRENT pay cycle (HR rule): today's
// date or a backdated day within it — never a future date, never a prior
// (already-closed) cycle. Pay cycles run the 23rd of the prior month → 22nd,
// so the current cycle started on the most recent 23rd.
function currentCycleBounds() {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
  const start = d >= 23 ? new Date(y, m, 23) : new Date(y, m - 1, 23);
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  return { min: iso(start), max: iso(now) };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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

export default function AbsenceRequestModal({ onClose, onSubmitted }) {
  const { user } = useAuth();
  const [department, setDepartment] = useState(user?.department || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [numberOfDays, setNumberOfDays] = useState(0);
  const [daysTouched, setDaysTouched] = useState(false);
  const [details, setDetails] = useState("");
  const [approverName, setApproverName] = useState("");
  const [approverEmail, setApproverEmail] = useState("");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const cycle = currentCycleBounds();

  useEffect(() => {
    if (!user?.id) return;
    api.get(`/api/employees/${user.id}/profile`).then(({ data }) => {
      if (data.reporting_to) setApproverName(data.reporting_to);
      if (data.reporting_to_email) setApproverEmail(data.reporting_to_email);
    }).catch(() => {});
  }, [user?.id]);

  useEffect(() => {
    if (!daysTouched) setNumberOfDays(daysBetween(startDate, endDate));
  }, [startDate, endDate, daysTouched]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (endDate < startDate) {
      setError("To date must be on or after the From date");
      return;
    }
    if (startDate < cycle.min || endDate > cycle.max) {
      setError("Absences can only be reported within the current pay cycle, up to today — no future or older dates.");
      return;
    }
    setBusy(true);
    try {
      let attachment_path = null;
      let attachment_filename = null;
      if (file) {
        const content_base64 = await fileToBase64(file);
        const { data } = await api.post("/api/absence-requests/upload", {
          filename: file.name,
          content_base64,
          content_type: file.type || "application/octet-stream",
        });
        attachment_path = data.path;
        attachment_filename = data.filename;
      }
      await api.post("/api/me/absence-requests", {
        department,
        start_date: startDate,
        end_date: endDate,
        number_of_days: Number(numberOfDays),
        details,
        approver_name: approverName,
        approver_email: approverEmail,
        attachment_path,
        attachment_filename,
        save_approver: true,
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
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">Report absence</p>
        <p className="font-display text-lg text-ink mb-5">Work-related absence request</p>

        <form onSubmit={submit} className="space-y-6">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Employee Details</p>
            <Field label="Dept." required>
              <input className={inputCls} required value={department} onChange={(e) => setDepartment(e.target.value)} />
            </Field>
            <Field label="Employee Code">
              <input className={readOnlyCls} value={user?.employee_code || ""} disabled />
            </Field>
            <Field label="Name" required>
              <input className={readOnlyCls} value={`${user?.first_name || ""} ${user?.last_name || ""}`.trim()} disabled />
            </Field>
            <Field label="Email" required>
              <input className={readOnlyCls} value={user?.email || ""} disabled />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="From" required>
                <input
                  type="date" required className={`${inputCls} font-nums`}
                  min={cycle.min} max={cycle.max}
                  value={startDate} onChange={(e) => setStartDate(e.target.value)}
                />
              </Field>
              <Field label="To" required>
                <input
                  type="date" required className={`${inputCls} font-nums`}
                  min={cycle.min} max={cycle.max}
                  value={endDate} onChange={(e) => setEndDate(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Number of days" required>
              <input
                type="number" min="0" step="0.5" required
                className={`${inputCls} font-nums`}
                value={numberOfDays}
                onChange={(e) => { setDaysTouched(true); setNumberOfDays(e.target.value); }}
              />
            </Field>
            <Field label="Details" required>
              <textarea
                required className={`${inputCls} min-h-[70px]`}
                value={details} onChange={(e) => setDetails(e.target.value)}
              />
            </Field>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Approver Details</p>
            <p className="text-xs text-ink/70 -mt-1">Enter below the details of your reporting manager who approves your leaves</p>
            <Field label="Name" required>
              <input className={inputCls} required value={approverName} onChange={(e) => setApproverName(e.target.value)} />
            </Field>
            <Field label="Approver email" required>
              <input
                type="email" required className={inputCls}
                value={approverEmail} onChange={(e) => setApproverEmail(e.target.value)}
              />
            </Field>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
              Attachment <span className="normal-case font-normal text-ink/50">(optional)</span>
            </label>
            <label className="flex items-center gap-2 w-full rounded-sm border border-dashed border-ink/20 bg-manila/40 px-3 py-2.5 text-sm text-ink/70 cursor-pointer hover:bg-manila/60 transition-colors">
              <Paperclip size={14} />
              {file ? file.name : "Add content…"}
              <input type="file" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
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
