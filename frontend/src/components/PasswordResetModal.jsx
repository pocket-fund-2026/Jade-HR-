import { X } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";

export default function PasswordResetModal({ employeeId, employeeName, onClose, onDone }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.put(`/api/employees/${employeeId}/password`, { password });
      onDone();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not reset password — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-sm p-6 border-t-4 border-jade-500 relative">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">Reset password</p>
        <p className="font-display text-lg text-ink mb-5">{employeeName}</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="reset_password" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">New password</label>
            <input
              id="reset_password"
              type="password"
              required
              minLength={4}
              autoComplete="new-password"
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
              {busy ? "Saving…" : "Set password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
