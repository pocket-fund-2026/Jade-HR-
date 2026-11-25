import { X } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";
import { formatDate } from "../lib/format.js";

// Appeal a rejected attendance dispute — one appeal per dispute, reviewed by
// someone other than whoever rejected it. Used on every login's screens.
export default function AppealModal({ dispute, onClose, onSubmitted }) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post(`/api/me/disputes/${dispute.id}/appeal`, { reason });
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Could not submit — try again");
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
        <p className="text-xs font-semibold text-ochre-700 mb-1">Appeal a rejected dispute</p>
        <p className="font-display text-lg text-ink mb-3">{formatDate(dispute.date)}</p>
        {dispute.admin_note && (
          <p className="text-sm text-ink/70 border-l-2 border-ink/20 pl-2.5 mb-4">Rejected: {dispute.admin_note}</p>
        )}
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="appeal_reason" className="block text-xs font-semibold text-ink/70 mb-1.5">Why should this be reconsidered</label>
            <textarea
              id="appeal_reason"
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 min-h-[100px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
          <p className="text-xs text-ink/70">You can appeal each dispute once. A different reviewer will decide it.</p>
          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}
          <div className="flex justify-end gap-4">
            <button type="button" onClick={onClose} className="text-sm text-ink/70 hover:text-ink px-2">Cancel</button>
            <button type="submit" disabled={busy} className="bg-ledger-800 text-manila px-[1.5em] py-[0.625em] leading-tight rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors">
              {busy ? "Submitting…" : "Submit appeal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
