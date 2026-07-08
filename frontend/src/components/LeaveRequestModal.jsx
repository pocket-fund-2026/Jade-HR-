import { X } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";

export const LEAVE_LABELS = {
  casual: "Casual Leave",
  sick: "Sick Leave",
  earned: "Earned Leave",
  unpaid: "Unpaid Leave",
  other: "Other",
};

export default function LeaveRequestModal({ onClose, onSubmitted }) {
  const [leaveType, setLeaveType] = useState("casual");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (endDate < startDate) {
      setError("End date must be on or after the start date");
      return;
    }
    if (leaveType === "other" && !remark.trim()) {
      setError("Please specify what kind of leave this is");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/me/leave-requests", {
        leave_type: leaveType,
        start_date: startDate,
        end_date: endDate,
        reason: leaveType === "other" ? `[${remark.trim()}] ${reason}` : reason,
      });
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not submit — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-md p-6 border-t-4 border-jade-500 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-ink/40 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">Request leave</p>
        <p className="font-display text-lg text-ink mb-5">New leave request</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/50 mb-1.5">Leave type</label>
            <select
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value)}
            >
              {Object.entries(LEAVE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {leaveType === "other" && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ochre-600 mb-1.5">Please specify</label>
              <input
                type="text"
                required
                placeholder="e.g. Bereavement, compensatory off, jury duty…"
                className="w-full rounded-sm border border-ochre-400/50 bg-ochre-50 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-ochre-500"
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/50 mb-1.5">From</label>
              <input
                type="date"
                required
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/50 mb-1.5">To</label>
              <input
                type="date"
                required
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/50 mb-1.5">Reason</label>
            <textarea
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 min-h-[70px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-ink/50 hover:text-ink px-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
            >
              {busy ? "Submitting…" : "Submit to admin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
