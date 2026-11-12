import { X } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";

const inputCls =
  "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

export default function ExitAssetsModal({ existing, onClose, onSubmitted }) {
  const [systemNo, setSystemNo] = useState(existing?.system_no || "");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!password.trim()) { setError("Your system password is required"); return; }
    setBusy(true);
    try {
      await api.post("/api/me/exit-assets", { system_no: systemNo, system_password: password });
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not submit — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50 overflow-y-auto py-8">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-md p-6 border-t-4 border-jade-500 relative my-auto">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">Before you go</p>
        <p className="font-display text-lg text-ink mb-1">System handover</p>
        <p className="text-xs text-ink/70 mb-5">
          So your system can be handed over. This goes only to HR and IT. Your password is needed; the system number is optional.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">System No. (optional)</label>
            <input className={inputCls} value={systemNo} onChange={(e) => setSystemNo(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">System password (required)</label>
            <div className="flex gap-2">
              <input className={inputCls} type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
              <button type="button" onClick={() => setShow((v) => !v)} className="text-xs text-ink/70 hover:text-ink px-2">{show ? "Hide" : "Show"}</button>
            </div>
            {existing?.submitted && <p className="text-[11px] text-ink/60 mt-1">You already submitted one. Enter it again only to change it.</p>}
          </div>
          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="text-sm text-ink/70 hover:text-ink px-2">Cancel</button>
            <button type="submit" disabled={busy} className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors">
              {busy ? "Saving…" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
