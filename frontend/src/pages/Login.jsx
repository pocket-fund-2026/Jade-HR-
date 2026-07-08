import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../lib/auth.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [employeeCode, setEmployeeCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const role = await login(employeeCode, password);
      navigate(role === "admin" ? "/admin" : "/employee");
    } catch (err) {
      setError(err.response?.data?.detail || "That code and password don't match our records.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-ledger-900 px-4 py-12 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-10">
          <div
            className="inline-flex flex-col items-center justify-center border-[3px] border-manila/70 rounded-full w-28 h-28 -rotate-3 mb-5"
            style={{ boxShadow: "0 0 0 1px rgba(239,233,218,0.15)" }}
          >
            <span className="font-display text-manila text-3xl font-semibold leading-none">JADE</span>
            <span className="font-display text-manila text-[11px] tracking-[0.4em] uppercase mt-2">HR</span>
          </div>
          <p className="text-manila/50 text-sm font-nums tracking-wide">Madhu Estate &middot; Mumbai</p>
        </div>

        <div className="bg-paper rounded-sm shadow-stamp px-8 pt-8 pb-7 border-t-4 border-jade-500">
          <p className="font-display text-ink text-lg mb-6">Clock in to your account</p>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/50 mb-1.5">
                Employee Code
              </label>
              <input
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 font-nums text-ink placeholder:text-ink/30 focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/50 mb-1.5">
                Password
              </label>
              <input
                type="password"
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-sm bg-ledger-800 text-manila py-2.5 font-semibold tracking-wide hover:bg-ledger-700 disabled:opacity-50 transition-colors"
            >
              {busy ? "Checking…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-manila/40 mt-6">
          First time setting up?{" "}
          <Link to="/setup" className="text-manila/70 hover:text-manila underline underline-offset-2">
            Create admin account
          </Link>
        </p>
      </div>
    </div>
  );
}
