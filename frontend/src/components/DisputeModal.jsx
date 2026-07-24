import { Paperclip, X } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";
import { formatDate } from "../lib/format.js";

const ISSUE_LABELS = {
  missed_clock_in: "Forgot to clock in",
  missed_clock_out: "Forgot to clock out",
  both: "Forgot to clock in and out",
  other: "Something else",
};

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function DisputeModal({ date, onClose, onSubmitted }) {
  const [issueType, setIssueType] = useState("missed_clock_out");
  const [claimedIn, setClaimedIn] = useState("");
  const [claimedOut, setClaimedOut] = useState("");
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const needsIn = issueType === "missed_clock_in" || issueType === "both";
  const needsOut = issueType === "missed_clock_out" || issueType === "both";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!photo) {
      setError("Please attach a photo of the attendance register as supporting evidence");
      return;
    }
    setBusy(true);
    try {
      const content_base64 = await fileToBase64(photo);
      const { data: uploaded } = await api.post("/api/disputes/upload", {
        filename: photo.name,
        content_base64,
        content_type: photo.type || "application/octet-stream",
      });
      await api.post("/api/me/disputes", {
        date,
        issue_type: issueType,
        claimed_in: needsIn && claimedIn ? `${claimedIn}:00` : null,
        claimed_out: needsOut && claimedOut ? `${claimedOut}:00` : null,
        reason,
        photo_path: uploaded.path,
        photo_filename: uploaded.filename,
      });
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not submit — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-md p-6 border-t-4 border-ochre-500 relative">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-ochre-700 mb-1">Report an attendance issue</p>
        <p className="font-display text-lg text-ink mb-5">{formatDate(date)}</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="issue_type" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">What happened</label>
            <select
              id="issue_type"
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
            >
              {Object.entries(ISSUE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {(needsIn || needsOut) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {needsIn && (
                <div>
                  <label htmlFor="claimed_in" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Actual clock-in</label>
                  <input
                    id="claimed_in"
                    type="time"
                    className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                    value={claimedIn}
                    onChange={(e) => setClaimedIn(e.target.value)}
                  />
                </div>
              )}
              {needsOut && (
                <div>
                  <label htmlFor="claimed_out" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Actual clock-out</label>
                  <input
                    id="claimed_out"
                    type="time"
                    className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                    value={claimedOut}
                    onChange={(e) => setClaimedOut(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="dispute_reason" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Explain what happened</label>
            <textarea
              id="dispute_reason"
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 min-h-[80px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">
              Photo of attendance register <span className="text-rust-500 normal-case font-normal">*Required</span>
            </label>
            <label className="flex items-center gap-2 w-full rounded-sm border border-dashed border-ink/20 bg-manila/40 px-3 py-2.5 text-sm text-ink/70 cursor-pointer hover:bg-manila/60 transition-colors">
              <Paperclip size={14} />
              {photo ? photo.name : "Attach photo…"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </label>
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
              {busy ? "Submitting…" : "Submit to admin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
