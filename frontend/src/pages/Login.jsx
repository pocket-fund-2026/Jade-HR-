import { Eye, EyeOff } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import api from "../lib/api.js";

import IconSwap from "../components/IconSwap.jsx";
import { useAuth } from "../lib/auth.jsx";

export default function Login() {
  const { login, reloadUser } = useAuth();
  const [params] = useSearchParams();
  const magicToken = params.get("magic") || "";
  const [mode, setMode] = useState("password"); // password | link
  const [linkId, setLinkId] = useState("");
  const [linkMsg, setLinkMsg] = useState("");
  const [showLinkPopup, setShowLinkPopup] = useState(false);
  const navigate = useNavigate();
  const [employeeCode, setEmployeeCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef(null);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const role = await login(employeeCode, password);
      navigate(role === "accounts" || role === "hr" ? "/admin" : "/employee");
    } catch (err) {
      setError(err.response?.data?.detail || "That code and password don't match our records.");
      // Error shake (transitions.dev): restart the animation on every failed try.
      const el = formRef.current;
      if (el) { el.classList.remove("is-shaking"); void el.offsetWidth; el.classList.add("is-shaking"); }
    } finally {
      setBusy(false);
    }
  };

  const sendLink = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/api/auth/magic-link", { identifier: linkId });
      setLinkMsg(data.message);
      setShowLinkPopup(true);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not send the link. Try again in a minute.");
    } finally {
      setBusy(false);
    }
  };

  // Deliberately a click, not automatic on load: mail scanners pre-fetch links
  // and would otherwise use up the one-time token before the person arrives.
  const confirmMagic = async () => {
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/api/auth/magic-link/verify", { token: magicToken }, { skipAuthRedirect: true });
      await reloadUser();
      navigate(data.role === "accounts" || data.role === "hr" ? "/admin" : "/employee", { replace: true });
    } catch (err) {
      setError(err.response?.data?.detail || "This sign-in link could not be used. Request a new one.");
      setBusy(false);
    }
  };

  const inputCls = "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-3 min-h-[44px] text-base text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500";
  const btnCls = "w-full rounded-sm bg-ledger-800 text-manila py-3 min-h-[44px] font-semibold tracking-wide hover:bg-ledger-700 active:bg-ledger-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors";

  return (
    <div className="min-h-screen flex items-center justify-center bg-ledger-900 px-4 py-12 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />

      <div className="w-full max-w-sm relative">
        <div className="text-center mb-10">
          <img src="/jade-logo.png" alt="JADE" className="w-24 h-24 mx-auto -rotate-2 mb-3" />
          <p className="font-display text-manila text-lg tracking-[0.15em] uppercase">HR</p>
          <p className="text-manila/75 text-sm font-nums tracking-wide mt-1">Madhu Estate &middot; Mumbai</p>
        </div>

        <div className="bg-paper rounded-sm shadow-stamp px-6 sm:px-8 pt-8 pb-7 border-t-4 border-jade-500 rise-in">
          <p className="font-display text-ink text-lg mb-6">Clock in to your account</p>

          {magicToken ? (
            <div className="space-y-5">
              <p className="text-sm text-ink/80">Your sign-in link is ready. Continue to open JADE HR.</p>
              {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}
              <button type="button" onClick={confirmMagic} disabled={busy} className={btnCls}>{busy ? "Signing in…" : "Continue to JADE HR"}</button>
              <p className="text-center text-xs text-ink/60">
                <Link to="/login" className="underline underline-offset-2">Use a different way to sign in</Link>
              </p>
            </div>
          ) : mode === "link" ? (
            linkMsg ? (
              <div className="space-y-4">
                <p className="text-sm text-ink/80">{linkMsg}</p>
                <p className="text-xs text-ink/70">The link only works if your email is registered with HR against your employee code. Nothing arrived? Check spam, or ask HR to add or correct your email.</p>
                <button type="button" onClick={() => { setLinkMsg(""); setMode("password"); }} className="text-xs text-jade-600 underline underline-offset-2">Back to sign in</button>
              </div>
            ) : (
              <form onSubmit={sendLink} className="space-y-5">
                <div>
                  <label htmlFor="link_id" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee code or email</label>
                  <input id="link_id" className={inputCls} value={linkId} onChange={(e) => setLinkId(e.target.value)} autoFocus required />
                </div>
                <p className="text-xs text-ink/70 bg-manila/60 border-l-2 border-jade-500 pl-2.5 py-1.5">
                  Note: the sign-in link only works if your email address is registered with HR and linked to your employee code. If you don't receive it, ask HR to add or correct your email.
                </p>
                {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}
                <button type="submit" disabled={busy} className={btnCls}>{busy ? "Sending…" : "Email me a sign-in link"}</button>
                <p className="text-center">
                  <button type="button" onClick={() => { setError(""); setMode("password"); }} className="text-xs text-jade-600 underline underline-offset-2">Sign in with password instead</button>
                </p>
              </form>
            )
          ) : (
          <>
          <form ref={formRef} onSubmit={submit} onAnimationEnd={(e) => e.currentTarget.classList.remove("is-shaking")} className="t-input space-y-5">
            <div>
              <label htmlFor="employee_code" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
                Employee Code
              </label>
              <input
                id="employee_code"
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-3 min-h-[44px] text-base font-nums text-ink placeholder:text-ink/40 focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                autoFocus
                required
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-3 min-h-[44px] pr-12 text-base text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 w-11 flex items-center justify-center text-ink/55 hover:text-ink/80"
                >
                  <IconSwap active={showPassword} a={<Eye size={17} />} b={<EyeOff size={17} />} />
                </button>
              </div>
            </div>

            <div className="text-right -mt-2">
              <Link to="/forgot-password" className="text-xs text-jade-600 hover:text-jade-500 underline underline-offset-2">
                Forgot password?
              </Link>
            </div>

            {error && (
              <p key={error} className="t-error-in text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-sm bg-ledger-800 text-manila py-3 min-h-[44px] font-semibold tracking-wide hover:bg-ledger-700 active:bg-ledger-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? "Checking…" : "Sign in"}
            </button>
          </form>
          <div className="mt-5 pt-4 border-t border-ink/10 text-center">
            <button type="button" onClick={() => { setError(""); setMode("link"); }} className="text-sm text-jade-600 hover:text-jade-500 underline underline-offset-2">
              Email me a sign-in link instead
            </button>
          </div>
          </>
          )}
        </div>

        {showLinkPopup && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" role="dialog" aria-modal="true" aria-labelledby="link-popup-title">
            <div className="w-full max-w-sm bg-paper rounded-sm shadow-stamp border-t-4 border-jade-500 p-6 space-y-3">
              <p id="link-popup-title" className="font-display text-ink text-lg">Check your email to log in</p>
              <p className="text-sm text-ink/80">
                You need to open the sign-in link we emailed you to log in. It works once and expires in 15 minutes.
              </p>
              <p className="text-xs text-ink/70 bg-manila/60 border-l-2 border-jade-500 pl-2.5 py-1.5">
                The link only works if your email is registered with HR against your employee code. Nothing arrived? Check spam, or ask HR to add or correct your email.
              </p>
              <button type="button" autoFocus onClick={() => setShowLinkPopup(false)} className={btnCls}>Got it</button>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-manila/75 mt-6">
          First time setting up?{" "}
          <Link to="/setup" className="text-manila/85 hover:text-manila underline underline-offset-2">
            Create admin account
          </Link>
        </p>
      </div>
    </div>
  );
}
