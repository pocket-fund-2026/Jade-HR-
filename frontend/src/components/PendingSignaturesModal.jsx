import { CheckCircle2, FileSignature, X } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";
import { SIGNATURE_FONT_STACK, signatureImage } from "../lib/signature.js";

// E-sign prompt on the approver's own dashboard (Head-HR): any letter HR has
// sent for e-signing to this login's email pops up here, so signing never
// depends on finding the emailed link. Signing uses the same flow as the
// emailed link (initials + confirm); "Later" hides it for this session.
const POLL_MS = 60000;

export default function PendingSignaturesModal() {
  const [pending, setPending] = useState([]);
  const [hidden, setHidden] = useState(false);
  const [fullName, setFullName] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => api.get("/api/offers/my-pending-signatures").then(({ data }) => setPending(data)).catch(() => {});
  useEffect(() => {
    load();
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, []);

  const current = pending[0];
  if (!current) return null;
  if (hidden) {
    return (
      <button onClick={() => setHidden(false)} className="fixed bottom-5 right-5 z-40 bg-jade-600 text-on-jade rounded-sm shadow-stamp px-4 py-3 text-sm font-semibold inline-flex items-center gap-2">
        <FileSignature size={16} /> {pending.length} letter{pending.length > 1 ? "s" : ""} waiting for your e-signature
      </button>
    );
  }

  const sign = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/offers/my-pending-signatures/${current.id}/sign`, { signature: fullName.trim(), signature_image: await signatureImage(fullName), confirm });
      setFullName("");
      setConfirm(false);
      await load();
    } catch (e) {
      setError(e.response?.data?.detail || "Could not sign");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-ledger-900/60" onClick={() => setHidden(true)} />
      <div className="relative bg-paper rounded-sm shadow-stamp w-full max-w-[820px] max-h-[92vh] flex flex-col">
        <div className="flex items-center gap-2 px-5 py-3 border-b border-ink/10">
          <FileSignature size={16} className="text-jade-600" />
          <p className="font-display text-lg text-ink flex-1">
            E-signature needed: {current.title} for {current.candidate_name}
            {pending.length > 1 ? ` (${pending.length} waiting)` : ""}
          </p>
          <button onClick={() => setHidden(true)} aria-label="Later" className="text-ink/60 hover:text-ink"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto bg-manila/60 p-3 sm:p-5">
          <article className="bg-white shadow-card px-6 py-8 sm:px-12">
            <div className="letter-doc" dangerouslySetInnerHTML={{ __html: current.rendered_body }} />
          </article>
        </div>
        <div className="px-5 py-4 border-t border-ink/10 space-y-2">
          <label htmlFor="sign_full_name" className="block text-xs font-semibold text-ink/70">Type your full name to sign</label>
          <input id="sign_full_name"
            value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} placeholder="First and last name"
            className="w-full max-w-sm rounded-sm border border-ink/15 bg-manila/40 px-4 py-2 text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          />
          <div className="border-b border-ink/40 min-h-[60px] max-w-sm flex items-end px-2 pb-1" aria-label="Signature preview">
            <span style={{ fontFamily: SIGNATURE_FONT_STACK, fontSize: 38, color: "#1a2a6c", lineHeight: 1.2 }}>{fullName}</span>
          </div>
          <label className="flex items-start gap-2 text-sm text-ink">
            <input type="checkbox" className="mt-1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
            I have read this letter and e-sign it.
          </label>
          {error && <p className="text-sm text-rust-500">{error}</p>}
          <div className="flex gap-2">
            <button onClick={sign} disabled={busy || fullName.trim().split(/\s+/).length < 2 || !confirm} className="flex-1 bg-jade-600 text-on-jade rounded-sm px-4 py-2.5 text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-1.5">
              <CheckCircle2 size={15} /> {busy ? "Signing…" : "Sign letter"}
            </button>
            <button onClick={() => setHidden(true)} className="px-4 py-2.5 text-sm text-ink/70 hover:text-ink">Later</button>
          </div>
        </div>
      </div>
    </div>
  );
}
