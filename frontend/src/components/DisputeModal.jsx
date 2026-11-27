import { AlarmClock, CalendarX, Flag, HelpCircle, LogIn, LogOut, Plane, Repeat } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";
import { prepareUpload } from "../lib/upload.js";
import { formatDate } from "../lib/format.js";
import RequestSheet, {
  ChoiceCard, ErrorNote, FilePick, QuickPick, SectionLabel, SubmitRow, inputCls, shiftDays,
} from "./RequestSheet.jsx";

const ISSUES = [
  { value: "missed_clock_out", icon: LogOut, title: "Forgot to clock out" },
  { value: "missed_clock_in", icon: LogIn, title: "Forgot to clock in" },
  { value: "both", icon: Repeat, title: "Forgot both" },
  { value: "late_coming", icon: AlarmClock, title: "Wrongly marked late" },
  { value: "weekly_off", icon: CalendarX, title: "Sunday marked absent" },
  { value: "leave", icon: Plane, title: "Leave marked wrongly" },
  { value: "other", icon: HelpCircle, title: "Something else" },
];

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
    <div className="flex gap-1.5" id={id}>
      <select aria-label="Hour" className={selectCls} value={hour12} onChange={(e) => emit(e.target.value, minute, ampm || "AM")}>
        <option value="">Hr</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <select aria-label="Minute" className={selectCls} value={minute} onChange={(e) => emit(hour12, e.target.value, ampm)}>
        <option value="">Min</option>
        {Array.from({ length: 60 }, (_, i) => i).map((n) => <option key={n} value={n}>{String(n).padStart(2, "0")}</option>)}
      </select>
      <div className="flex rounded-sm border border-ink/15 overflow-hidden" role="group" aria-label="AM or PM">
        {["AM", "PM"].map((p) => (
          <button key={p} type="button" onClick={() => emit(hour12 || 12, minute, p)}
            className={`px-2.5 text-xs font-semibold transition-colors ${ampm === p ? "bg-ledger-800 text-manila" : "bg-manila/40 text-ink/70 hover:text-ink"}`}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

const dayLabel = (iso, today) => {
  if (iso === today) return "Today";
  if (iso === shiftDays(today, -1)) return "Yesterday";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
};

export default function DisputeModal({ date: initialDate, onClose, onSubmitted, defaultIssue }) {
  const [date, setDate] = useState(initialDate);
  const [issueType, setIssueType] = useState(defaultIssue || "missed_clock_out");
  const [claimedIn, setClaimedIn] = useState("");
  const [claimedOut, setClaimedOut] = useState("");
  const [outDate, setOutDate] = useState(initialDate);
  useEffect(() => { setOutDate((o) => (o < date ? date : o)); }, [date]);
  const [reason, setReason] = useState("");
  const [delayReason, setDelayReason] = useState("");
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [policy, setPolicy] = useState(null);
  const [rejected, setRejected] = useState(null);
  const [done, setDone] = useState(false);

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

  const recentDays = policy?.today
    ? Array.from({ length: Math.min((policy.max_age_days ?? 7) + 1, 8) }, (_, i) => shiftDays(policy.today, -i))
    : [];

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!photo && !photoOptional) {
      setError("Please attach a photo of the attendance register — HR needs it to fix the record.");
      return;
    }
    if (needsDelay && (delayWords < minWords || delayReason.trim().length < 40)) {
      setError(`Please explain why this wasn't raised sooner — at least ${minWords} words.`);
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
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || "Could not send — please try again");
    } finally {
      setBusy(false);
    }
  };

  const issueTitle = ISSUES.find((i) => i.value === issueType)?.title;

  return (
    <RequestSheet
      icon={Flag}
      accent="ochre"
      eyebrow="Fix my attendance"
      title={`Something wrong on ${formatDate(date)}?`}
      onClose={onClose}
      done={done && {
        title: "Sent to HR",
        text: `"${issueTitle}" for ${formatDate(date)}. You'll see HR's decision under My reported issues, and the day is marked Reported meanwhile.`,
        onDone: onSubmitted,
      }}
      footer={!rejected && <SubmitRow form="dispute-form" onCancel={onClose} busy={busy} label="Send to HR" />}
    >
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
        <form id="dispute-form" onSubmit={submit}>
          <SectionLabel>Which day?</SectionLabel>
          {recentDays.length > 0 && (
            <div className="mb-2">
              <QuickPick value={date} onPick={setDate} options={recentDays.map((d) => ({ value: d, label: dayLabel(d, policy.today) }))} />
            </div>
          )}
          <div className="flex items-center gap-2 mb-1">
            <label htmlFor="dispute_date" className="text-[11px] text-ink/60">or pick a date</label>
            <input id="dispute_date" type="date" required value={date} max={policy?.today}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className={`${inputCls} font-nums !w-auto !py-1.5`} />
          </div>
          <p className="text-[11px] text-ink/55 mb-2">For a shift that ran past midnight, choose the day it started.</p>
          {policy && (tooOld || needsDelay) && (
            <p className={`text-xs mb-2 rounded-sm px-3 py-2 ${tooOld ? "text-rust-500 bg-rust-50" : "text-ochre-700 bg-ochre-50"}`}>
              {tooOld
                ? `This day is more than ${policy.max_age_days} days old, so it may be rejected. Disputes should be raised within ${policy.max_age_days} days.`
                : `This is ${daysLate} days ago — you'll need to say why it wasn't raised sooner.`}
            </p>
          )}

          <div className="mt-4">
            <SectionLabel>What went wrong?</SectionLabel>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {ISSUES.map((i) => (
                <ChoiceCard key={i.value} selected={issueType === i.value} onClick={() => setIssueType(i.value)} icon={i.icon} title={i.title} />
              ))}
            </div>
          </div>

          {(needsIn || needsOut) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
              {needsIn && (
                <div>
                  <SectionLabel htmlFor="claimed_in">I actually arrived at</SectionLabel>
                  <TimeAmPm id="claimed_in" value={claimedIn} onChange={setClaimedIn} />
                </div>
              )}
              {needsOut && (
                <div>
                  <SectionLabel htmlFor="claimed_out">I actually left at</SectionLabel>
                  <TimeAmPm id="claimed_out" value={claimedOut} onChange={setClaimedOut} />
                  <label className="flex items-center gap-2 mt-2 text-[11px] text-ink/65">
                    <input type="checkbox" checked={outDate !== date}
                      onChange={(e) => setOutDate(e.target.checked ? shiftDays(date, 1) : date)} />
                    Left after midnight (next day)
                  </label>
                </div>
              )}
            </div>
          )}

          <SectionLabel htmlFor="dispute_reason" required>What happened?</SectionLabel>
          <textarea id="dispute_reason" required rows={2} className={`${inputCls} mb-4`}
            placeholder="e.g. Biometric wasn't working, signed the register instead"
            value={reason} onChange={(e) => setReason(e.target.value)} />

          {needsDelay && (
            <div className="mb-4">
              <SectionLabel htmlFor="dispute_delay_reason" required>Why are you raising this {daysLate} days later?</SectionLabel>
              <textarea id="dispute_delay_reason" required rows={3} className={inputCls}
                placeholder="What happened, why you couldn't raise it earlier, and when you found out"
                value={delayReason} onChange={(e) => setDelayReason(e.target.value)} />
              <p className={`text-[11px] mt-1 ${delayWords >= minWords ? "text-jade-700" : "text-ink/60"}`}>{delayWords} of {minWords} words minimum</p>
            </div>
          )}

          <SectionLabel optional={photoOptional} required={!photoOptional}>Photo of the attendance register</SectionLabel>
          <FilePick file={photo} onChange={setPhoto} accept="image/*" placeholder="Take or attach a photo" />

          <ErrorNote>{error}</ErrorNote>
        </form>
      )}
    </RequestSheet>
  );
}
