import { Paperclip, X } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";
import { prepareUpload } from "../lib/upload.js";
import { formatDate } from "../lib/format.js";

const ISSUE_LABELS = {
  missed_clock_in: "Forgot to clock in",
  missed_clock_out: "Forgot to clock out",
  both: "Forgot to clock in and out",
  late_coming: "Dispute my late mark",
  weekly_off: "Dispute Sunday marked absent",
  leave: "Dispute my leave day (I did not take / was marked wrongly)",
  other: "Something else",
};

// Explicit hour / minute / AM-PM selects. A native <input type="time"> only shows
// AM/PM when the device locale is 12-hour, so many people could not pick AM/PM.
// Value in/out is "HH:MM" in 24-hour form (what the API expects), "" when unset.
const selectCls = "rounded-sm border border-ink/15 bg-manila/40 px-2 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";
function TimeAmPm({ id, value, onChange }) {
  const [h24, m] = value ? value.split(":").map(Number) : [null, null];
  const hour12 = h24 == null ? "" : h24 % 12 === 0 ? 12 : h24 % 12;
  const minute = m == null ? "" : m;
  const ampm = h24 == null ? "" : h24 >= 12 ? "PM" : "AM";
  const emit = (hh, mm, ap) => {
    if (hh === "" || ap === "") { onChange(""); return; }
    const base = Number(hh) % 12;
    const h = ap === "PM" ? base + 12 : base;
    onChange(`${String(h).padStart(2, "0")}:${String(mm === "" ? 0 : Number(mm)).padStart(2, "0")}`);
  };
  return (
    <div className="flex gap-2" id={id}>
      <select aria-label="Hour" className={selectCls} value={hour12} onChange={(e) => emit(e.target.value, minute, ampm || "AM")}>
        <option value="">Hr</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select aria-label="Minute" className={selectCls} value={minute} onChange={(e) => emit(hour12, e.target.value, ampm)}>
        <option value="">Min</option>
        {Array.from({ length: 60 }, (_, i) => i).map((n) => <option key={n} value={n}>{String(n).padStart(2, "0")}</option>)}
      </select>
      <select aria-label="AM or PM" className={selectCls} value={ampm} onChange={(e) => emit(hour12, minute, e.target.value)}>
        <option value="">AM/PM</option>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

export default function DisputeModal({ date: initialDate, onClose, onSubmitted, defaultIssue }) {
  const [date, setDate] = useState(initialDate);
  const [issueType, setIssueType] = useState(defaultIssue || "missed_clock_out");
  const [claimedIn, setClaimedIn] = useState("");
  const [claimedOut, setClaimedOut] = useState("");
  const [outDate, setOutDate] = useState(initialDate);
  useEffect(() => { setOutDate((o) => (o < date ? date : o)); }, [date]);
  const nextDay = (d) => { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + 1); return x.toISOString().slice(0, 10); };
  const [reason, setReason] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState(null);
  const [rejected, setRejected] = useState(null);

  useEffect(() => {
    api.get("/api/disputes/policy").then(({ data }) => setPolicy(data)).catch(() => {});
  }, []);
  const tooOld = policy && date < policy.earliest_date;
  const daysLate = policy ? Math.round((new Date(policy.today) - new Date(date)) / 86400000) : 0;
  const needsDelay = policy && !tooOld && daysLate > (policy.delay_reason_after_days ?? 1);
  const delayWords = (delayReason.match(/[A-Za-z0-9']+/g) || []).length;
  const minWords = policy?.delay_reason_min_words ?? 8;

  const photoOptional = issueType === "late_coming" || issueType === "weekly_off" || issueType === "leave";
  const needsIn = issueType === "missed_clock_in" || issueType === "both" || issueType === "late_coming";
  const needsOut = issueType === "missed_clock_out" || issueType === "both";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!photo && !photoOptional) {
      setError("Please attach a photo of the attendance register as supporting evidence");
      return;
    }
    if (needsDelay && (delayWords < minWords || delayReason.trim().length < 40)) {
      setError(`Please explain in detail why this was not raised sooner — at least ${minWords} words.`);
      return;
    }
    setBusy(true);
    try {
      let uploaded = { path: "", filename: null };
      if (photo) {
        const prepared = await prepareUpload(photo);
        uploaded = (await api.post("/api/disputes/upload", prepared)).data;
      }
      const { data: created } = await api.post("/api/me/disputes", {
        date,
        issue_type: issueType,
        claimed_in: needsIn && claimedIn ? `${claimedIn}:00` : null,
        claimed_out: needsOut && claimedOut ? `${claimedOut}:00` : null,
        claimed_out_date: needsOut && claimedOut && outDate !== date ? outDate : null,
        reason,
        delay_reason: needsDelay ? delayReason.trim() : "",
        photo_path: uploaded.path,
        photo_filename: uploaded.filename,
      });
      if (created?.auto_rejected) {
        setRejected(created.auto_reject_reason);
        return;
      }
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
        <div className="mb-5">
          <label htmlFor="dispute_date" className="block text-xs font-semibold text-ink/70 mb-1.5">Day this is about</label>
          <input id="dispute_date" type="date" required value={date} max={policy?.today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-sm border border-ink/15 bg-manila/40 px-4 py-2 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
          {policy?.today && (
            <select aria-label="Pick a recent day" value="" onChange={(e) => e.target.value && setDate(e.target.value)}
              className="ml-2 rounded-sm border border-ink/15 bg-manila/40 px-2 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
              <option value="">Recent days…</option>
              {Array.from({ length: (policy.max_age_days ?? 7) + 1 }, (_, i) => {
                const d = new Date(policy.today + "T00:00:00"); d.setDate(d.getDate() - i);
                const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                return <option key={iso} value={iso}>{formatDate(iso)}</option>;
              })}
            </select>
          )}
          <p className="text-[11px] text-ink/60 mt-1">{formatDate(date)}. For a shift that ran past midnight, choose the day it started.</p>
        </div>

        {rejected ? (
          <div>
            <p className="text-sm font-semibold text-rust-500 mb-2">This was rejected by the attendance policy</p>
            <p className="text-sm text-ink/80 border-l-2 border-rust-500 pl-2.5 mb-3">{rejected}</p>
            <p className="text-xs text-ink/60 mb-5">It is saved in your list, and you can appeal it once if you think it is wrong. An appeal is reviewed by a person.</p>
            <div className="flex justify-end">
              <button onClick={onSubmitted} className="bg-ledger-800 text-manila px-[1.5em] py-[0.625em] leading-tight rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors">OK</button>
            </div>
          </div>
        ) : (
        <>
        {policy && (
          <p className={`text-xs mb-4 border-l-2 pl-2.5 py-0.5 ${tooOld ? "text-rust-500 border-rust-500" : "text-ink/60 border-ink/20"}`}>
            {tooOld
              ? `This day is more than ${policy.max_age_days} days old, so a dispute for it will be rejected automatically. Disputes must be raised weekly.`
              : `Raise disputes within ${policy.max_age_days} days of the day (earliest accepted today: ${formatDate(policy.earliest_date)}). Anything older than ${policy.delay_reason_after_days ?? 1} day needs a detailed reason for the delay; later than that is rejected automatically.`}
          </p>
        )}
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
                  <p className="text-[11px] text-ink/60 mb-1.5">Clock-in date: {formatDate(date)}</p>
                  <label htmlFor="claimed_in" className="block text-xs font-semibold text-ink/70 mb-1.5">Actual clock-in time (AM/PM)</label>
                  <TimeAmPm id="claimed_in" value={claimedIn} onChange={setClaimedIn} />
                </div>
              )}
              {needsOut && (
                <div>
                  <label htmlFor="claimed_out_date" className="block text-xs font-semibold text-ink/70 mb-1.5">Clock-out date</label>
                  <input
                    id="claimed_out_date"
                    type="date" min={date} max={nextDay(date)} value={outDate}
                    onChange={(e) => e.target.value && setOutDate(e.target.value)}
                    className="w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 mb-3"
                  />
                  <label htmlFor="claimed_out" className="block text-xs font-semibold text-ink/70 mb-1.5">Actual clock-out time (AM/PM)</label>
                  <TimeAmPm id="claimed_out" value={claimedOut} onChange={setClaimedOut} />
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

          {needsDelay && (
            <div>
              <label htmlFor="dispute_delay_reason" className="block text-xs font-semibold text-ink/70 mb-1.5">
                Why are you raising this {daysLate} days late? <span className="text-rust-500 normal-case font-normal">*Required</span>
              </label>
              <textarea
                id="dispute_delay_reason"
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 min-h-[80px]"
                value={delayReason}
                onChange={(e) => setDelayReason(e.target.value)}
                placeholder="What happened, why you could not raise it earlier, and when you found out"
                required
              />
              <p className={`text-[11px] mt-1 ${delayWords >= minWords ? "text-jade-700" : "text-ink/60"}`}>{delayWords} of {minWords} words minimum</p>
            </div>
          )}

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
              className="bg-ledger-800 text-manila px-[1.5em] py-[0.625em] leading-tight rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
            >
              {busy ? "Submitting…" : "Submit to admin"}
            </button>
          </div>
        </form>
        </>
        )}
      </div>
    </div>
  );
}
