import { KeyRound } from "lucide-react";
import { useState } from "react";

import { useAuth } from "../lib/auth.jsx";
import api from "../lib/api.js";

// Mandatory, one-time gate: shown after policy acknowledgement and the
// personal-info gate, to anyone (new joiner or existing employee) who has
// never set their own password — hr_employees.password_changed_by_employee
// starts false for everyone and is set true only by POST
// /api/auth/change-password, so this keeps re-appearing on login until they
// actually do it. Same in-place-render / can't-skip contract as
// PolicyAcknowledgement.jsx and PersonalInfoGate.jsx.
//
// Password fields are deliberately plain text (not type="password") — asked
// for explicitly so employees typing on shared/factory-floor devices can see
// what they're entering instead of mistyping a masked field.
export default function ChangePasswordGate() {
  const { user, reloadUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const tooShort = newPassword.length > 0 && newPassword.length < 6;
  const mismatched = confirmPassword.length > 0 && newPassword !== confirmPassword;
  const canSubmit = currentPassword && newPassword.length >= 6 && newPassword === confirmPassword;

  const submit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      // Flips password_changed_by_employee on the /me payload, letting the
      // router through to whatever the user was originally headed for.
      await reloadUser();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not change your password — please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-manila flex flex-col">
      <header className="bg-ledger-800 text-manila px-5 sm:px-8 py-5">
        <div className="max-w-md mx-auto">
          <div className="flex items-center gap-2">
            <KeyRound size={20} className="text-manila/80" />
            <h1 className="font-display text-xl sm:text-2xl">Set a new password</h1>
          </div>
          <p className="text-sm text-manila/70 mt-1.5">
            {user?.name ? `${user.name}, before` : "Before"} you continue, please change your password from the
            one you were given. This is required once.
          </p>
        </div>
      </header>

      <div className="flex-1 max-w-md w-full mx-auto px-5 sm:px-8 py-6">
        <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-5 space-y-5">
          <label className="block">
            <span className="text-sm font-medium text-ink">Current Password</span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ink">New Password</span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
            />
            <span className="text-[11px] text-ink/60 mt-1 block">At least 6 characters.</span>
            {tooShort && <span className="text-[11px] text-rust-500 mt-0.5 block">Too short — needs at least 6 characters.</span>}
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ink">Confirm New Password</span>
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
            />
            {mismatched && <span className="text-[11px] text-rust-500 mt-0.5 block">Doesn't match the new password above.</span>}
          </label>

          {error && <p className="text-sm text-rust-500">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit || submitting}
            className="w-full flex items-center justify-center gap-1.5 bg-jade-600 text-white px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-40 transition-colors"
          >
            <KeyRound size={15} />
            {submitting ? "Saving…" : "Set new password and continue"}
          </button>
        </form>
      </div>
    </div>
  );
}
