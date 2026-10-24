import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

import api from "../lib/api.js";

const inputCls = "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-3 min-h-[44px] text-base text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500";
const labelCls = "block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5";
const buttonCls = "w-full rounded-sm bg-ledger-800 text-manila py-3 min-h-[44px] font-semibold tracking-wide hover:bg-ledger-700 disabled:opacity-50 transition-colors";

function Shell({ title, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-ledger-900 px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/jade-logo.png" alt="JADE" className="w-20 h-20 mx-auto mb-3" />
          <p className="font-display text-manila text-lg tracking-[0.15em] uppercase">HR</p>
        </div>
        <div className="bg-paper rounded-sm shadow-stamp px-6 sm:px-8 pt-8 pb-7 border-t-4 border-jade-500">
          <p className="font-display text-ink text-lg mb-5">{title}</p>
          {children}
        </div>
        <p className="text-center text-xs text-manila/75 mt-6">
          <Link to="/login" className="underline underline-offset-2 hover:text-manila">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/api/auth/forgot-password", { employee_code: code.trim() });
      setMessage(data.message);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not send the link. Try again in a minute, or ask HR to reset your password.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Forgot your password?">
      {message ? (
        <p className="text-sm text-ink/80">{message}</p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label htmlFor="employee_code" className={labelCls}>Employee Code</label>
            <input id="employee_code" className={`${inputCls} font-nums`} value={code} onChange={(e) => setCode(e.target.value)} autoFocus required />
          </div>
          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5">{error}</p>}
          <button type="submit" disabled={busy} className={buttonCls}>{busy ? "Sending…" : "Email me a reset link"}</button>
        </form>
      )}
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) return setError("Password must be at least 6 characters");
    if (password !== confirm) return setError("The two passwords don't match");
    setBusy(true);
    try {
      await api.post("/api/auth/reset-password", { token, password });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not reset the password. Request a new link.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Choose a new password">
      {done ? (
        <p className="text-sm text-ink/80">Your password has been changed. <Link to="/login" className="text-jade-600 underline">Sign in</Link> with the new one.</p>
      ) : !token ? (
        <p className="text-sm text-ink/80">This link is incomplete. <Link to="/forgot-password" className="text-jade-600 underline">Request a new one.</Link></p>
      ) : (
        <form onSubmit={submit} className="space-y-5">
          <div>
            <label htmlFor="new_password" className={labelCls}>New password</label>
            <input id="new_password" type="password" className={inputCls} value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required />
          </div>
          <div>
            <label htmlFor="confirm_password" className={labelCls}>Confirm password</label>
            <input id="confirm_password" type="password" className={inputCls} value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
          </div>
          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5">{error}</p>}
          <button type="submit" disabled={busy} className={buttonCls}>{busy ? "Saving…" : "Save new password"}</button>
        </form>
      )}
    </Shell>
  );
}
