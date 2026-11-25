import { Paperclip, X } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";
import { prepareUpload } from "../lib/upload.js";
import { formatDate } from "../lib/format.js";

const ISSUE_LABELS = {
  missed_clock_in: "Forgot to clock in",
  missed_clock_out: "Forgot to clock out",
  both: "Forgot to clock in and out",
  late_coming: "Dispute my late mark",
  weekly_off: "Dispute Sunday marked absent",
  other: "Something else",
};

export default function DisputeModal({ date, onClose, onSubmitted, defaultIssue }) {
  const [issueType, setIssueType] = useState(defaultIssue || "missed_clock_out");
  const [claimedIn, setClaimedIn] = useState("");
  const [claimedOut, setClaimedOut] = useState("");
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const photoOptional = issueType === "late_coming" || issueType === "weekly_off";
  const needsIn = issueType === "missed_clock_in" || issueType === "both" || issueType === "late_coming";
  const needsOut = issueType === "missed_clock_out" || issueType === "both";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!photo && !photoOptional) {
      setError("Please attach a photo of the attendance register as supporting evidence");
      return;
    }
    setBusy(true);
    try {
      let uploaded = { path: "", filename: null };
      if (photo) {
        const prepared = await prepareUpload(photo);
        uploaded = (await api.post("/api/disputes/upload", prepared)).data;
      }
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
      setError(err.response?.data?.detail || err.message || "Could not submit — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50 overflow-y-auto py-8">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-md p-6 border-t-4 border-ochre-500 relative my-auto">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        <p className="text-xs font-semibold text-ochre-700 mb-1">Report an attendance issue</p>
        <p className="font-display text-lg text-ink mb-5">{formatDate(date)}</p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="issue_type" className="block text-xs font-semibold text-ink/70 mb-1.5">What happened</label>
            <select
              id="issue_type"
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              value={issueType}
              onChange={(e) => setIssueType(e.target.value)}
            >
              {Object.entries(ISSUE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {(needsIn || needsOut) && issueType !== "weekly_off" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {needsIn && (
                <div>
                  <label htmlFor="claimed_in" className="block text-xs font-semibold text-ink/70 mb-1.5">Actual clock-in</label>
                  <input
                    id="claimed_in"
                    type="time"
                    className="w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                    value={claimedIn}
                    onChange={(e) => setClaimedIn(e.target.value)}
                  />
                </div>
              )}
              {needsOut && (
                <div>
                  <label htmlFor="claimed_out" className="block text-xs font-semibold text-ink/70 mb-1.5">Actual clock-out</label>
                  <input
                    id="claimed_out"
                    type="time"
                    className="w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                    value={claimedOut}
                    onChange={(e) => setClaimedOut(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label htmlFor="dispute_reason" className="block text-xs font-semibold text-ink/70 mb-1.5">Explain what happened</label>
            <textarea
              id="dispute_reason"
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 min-h-[80px]"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink/70 mb-1.5">
              Photo of attendance register <span className="text-rust-500 normal-case font-normal">{photoOptional ? "(optional)" : "*Required"}</span>
            </label>
            <label className="flex items-center gap-2 w-full rounded-sm border border-dashed border-ink/20 bg-manila/40 px-3 py-2.5 text-sm text-ink/70 cursor-pointer hover:bg-manila/60 transition-colors">
              <Paperclip size={14} />
              {photo ? photo.name : "Attach photo…"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
            </label>
          </div>

          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}

          <div className="flex justify-end gap-4 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-ink/70 hover:text-ink px-2">
              Cancel
            </button>
            <button
              type="submit"
              disabled={busy}
              className="bg-ledger-800 text-on-jade px-[1.5em] py-[0.625em] leading-tight rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
            >
              {busy ? "Submitting…" : "Submit to admin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
