import { X } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";

export default function WFHRequestModal({ onClose, onSubmitted }) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!startDate || !endDate) {
      setError("Start and end date are required.");
      return;
    }
    if (endDate < startDate) {
      setError("End date must be on/after the start date.");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/wfh-requests", { start_date: startDate, end_date: endDate, reason });
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
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">Request Work From Home</p>
        <p className="font-display text-lg text-ink mb-1">Not an entitlement — approved only in exceptional circumstances</p>
        <p className="text-xs text-ink/70 mb-5">
          Needs Senior Management / HR Head approval, and your Reporting Manager confirming the assigned work was
          completed. Only then does the day pay at 50%; otherwise it falls back to normal attendance/leave rules.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">From</label>
              <input
                type="date" required
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                value={startDate} onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">To</label>
              <input
                type="date" required
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                value={endDate} onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Reason</label>
            <textarea
              required
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm min-h-[70px] text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              value={reason} onChange={(e) => setReason(e.target.value)}
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
              {busy ? "Submitting…" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
