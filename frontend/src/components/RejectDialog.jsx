import { useEffect, useState } from "react";

import api from "../lib/api.js";

const INPUT = "w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500";
const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-ink/50";
const FALLBACK = ["Not enough relevant experience", "Skills do not match the role", "Location / not willing to relocate", "Notice period too long", "Salary expectation beyond budget", "Not a culture / brand fit", "Candidate withdrew"];

// Rejection reason picker. A rejected applicant leaves the active lists (kept under "Rejected" with this reason) and
// stops receiving automated mail and interview-time offers. onConfirm({ reason, note }).
export default function RejectDialog({ names = [], onConfirm, onCancel, busy = false }) {
  const [presets, setPresets] = useState(FALLBACK);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { api.get("/api/careers/reject-presets").then(({ data }) => Array.isArray(data) && data.length && setPresets(data)).catch(() => {}); }, []);
  const who = names.length === 1 ? names[0] : `${names.length} applicants`;
  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-3" onClick={() => !busy && onCancel()}>
      <form
        className="bg-paper rounded-sm shadow-card w-full max-w-md p-5 space-y-3"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onConfirm({ reason: reason.trim(), note: note.trim() }); }}
      >
        <p className="font-display text-lg text-ink">Reject {who}</p>
        <p className="text-xs text-ink/65">The reason is kept on the record. They leave the active lists and no further automated emails or interview-time offers go to them. Nothing is emailed by this action.</p>
        <label className="block">
          <span className={LABEL}>Reason</span>
          <select required value={presets.includes(reason) ? reason : reason ? "__other" : ""} onChange={(e) => setReason(e.target.value === "__other" ? " " : e.target.value)} className={`${INPUT} mt-1`}>
            <option value="">Choose a reason…</option>
            {presets.map((p) => <option key={p} value={p}>{p}</option>)}
            <option value="__other">Other (write below)</option>
          </select>
        </label>
        {reason && !presets.includes(reason) && (
          <input autoFocus value={reason.trimStart()} onChange={(e) => setReason(e.target.value || " ")} placeholder="Reason" className={INPUT} />
        )}
        <label className="block">
          <span className={LABEL}>Note (optional)</span>
          <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={`${INPUT} mt-1`} placeholder="Shown with the rejection, e.g. portfolio lacked tailoring work." />
        </label>
        <div className="flex gap-2 pt-1">
          <button type="submit" disabled={busy || !reason.trim()} className="px-3 py-1.5 rounded-sm text-xs font-semibold bg-rust-500 text-white hover:opacity-90 disabled:opacity-40">{busy ? "Rejecting…" : "Reject"}</button>
          <button type="button" disabled={busy} onClick={onCancel} className="px-3 py-1.5 rounded-sm text-xs text-ink/70 hover:text-ink">Cancel</button>
        </div>
      </form>
    </div>
  );
}
