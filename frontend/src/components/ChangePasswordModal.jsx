import { X } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";

const inputCls =
  "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

// Self-service password change — available to every logged-in user for their
// OWN account (POST /api/auth/change-password). Distinct from the admin reset
// (PasswordResetModal), which sets someone else's password.
export default function ChangePasswordModal({ onClose }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (next.length < 6) {
      setError("New password must be at least 6 characters");
      return;
    }
    if (next !== confirm) {
      setError("New passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await api.post("/api/auth/change-password", { current_password: current, new_password: next });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not change password — try again");
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
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">Account</p>
        <p className="font-display text-lg text-ink mb-5">Change password</p>

        {done ? (
          <div className="space-y-4">
            <p className="text-sm text-ink">Your password has been updated. Use it the next time you sign in.</p>
            <div className="flex justify-end">
              <button onClick={onClose} className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors">
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="cp_current" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Current password</label>
              <input id="cp_current" type="password" required autoComplete="current-password" className={inputCls} value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div>
              <label htmlFor="cp_new" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">New password</label>
              <input id="cp_new" type="password" required autoComplete="new-password" minLength={6} className={inputCls} value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div>
              <label htmlFor="cp_confirm" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Confirm new password</label>
              <input id="cp_confirm" type="password" required autoComplete="new-password" minLength={6} className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>

            {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} className="text-sm text-ink/70 hover:text-ink px-2">Cancel</button>
              <button type="submit" disabled={busy} className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors">
                {busy ? "Saving…" : "Update password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
