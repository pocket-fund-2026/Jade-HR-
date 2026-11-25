import { X } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";
import { formatDate } from "../lib/format.js";
import { SIGNATURE_FONT_STACK } from "../lib/signature.js";

const inputCls =
  "w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

function SignRow({ item, fullName, onSigned }) {
  const [notes, setNotes] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sign = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post(`/api/me/exit-signoffs/${item.item_id}/sign`, { confirm, notes });
      onSigned(item.item_id);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not sign — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={sign} className="border border-ink/10 rounded-sm p-4 space-y-4">
      <div>
        <p className="text-sm text-ink font-semibold">
          {item.employee_name} <span className="font-nums font-normal text-ink/60">({item.employee_code})</span>
        </p>
        <p className="text-xs text-ink/70">
          {item.employee_department || "—"} · last working day {formatDate(item.last_working_day)}
        </p>
        <p className="text-xs text-ink/70 mt-1">
          You are signing: <strong>{item.row_department}</strong> — {item.item_label}
        </p>
      </div>
      <div>
        <label htmlFor={`signoff_notes_${item.item_id}`} className="block text-xs font-semibold text-ink/70 mb-1.5">Notes (optional)</label>
        <input id={`signoff_notes_${item.item_id}`} className={inputCls} placeholder="Anything HR should know about this clearance" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="border-b border-ink/40 min-h-[48px] flex items-end px-2 pb-1" aria-label="Your signature">
        <span style={{ fontFamily: SIGNATURE_FONT_STACK, fontSize: 32, color: "#1a2a6c", lineHeight: 1.2 }}>{fullName}</span>
      </div>
      <label className="flex items-start gap-2 text-xs text-ink/80 cursor-pointer">
        <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} className="mt-0.5 rounded border-ink/30 text-jade-600 focus:ring-jade-500" />
        I confirm that everything under my department is cleared for this person and I am signing on its behalf.
      </label>
      {error && <p className="text-xs text-rust-500 border-l-2 border-rust-500 pl-2">{error}</p>}
      <div className="flex justify-end">
        <button type="submit" disabled={busy || !confirm} className="bg-jade-600 text-on-jade px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-jade-700 disabled:opacity-40 transition-colors">
          {busy ? "Signing…" : "Sign off"}
        </button>
      </div>
    </form>
  );
}

export default function ExitSignoffModal({ items, fullName, onClose, onChanged }) {
  const [left, setLeft] = useState(items);
  const signed = (id) => {
    const next = left.filter((i) => i.item_id !== id);
    setLeft(next);
    onChanged?.(next);
    if (next.length === 0) onClose();
  };
  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50 overflow-y-auto py-8">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-lg p-6 border-t-4 border-jade-500 relative my-auto">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        <p className="text-xs font-semibold text-jade-600 mb-1">Exit clearance</p>
        <p className="font-display text-lg text-ink mb-1">
          {left.length === 1 ? "A departure needs your e-sign" : `${left.length} departures need your e-sign`}
        </p>
        <p className="text-xs text-ink/70 mb-5">You are named as the signer for these rows of the Final Settlement Form. Sign each one once it is cleared.</p>
        <div className="space-y-4">
          {left.map((it) => <SignRow key={it.item_id} item={it} fullName={fullName} onSigned={signed} />)}
        </div>
      </div>
    </div>
  );
}
