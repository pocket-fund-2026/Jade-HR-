import { Star, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";
import { INTERVIEW_MODES, INTERVIEW_STATUSES, RECOMMENDATIONS, formatDateTime, utcToDate } from "../lib/careers.js";
import StampBadge from "./StampBadge.jsx";

const INPUT = "w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500";
const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-ink/50";
const INTERVIEW_TONE = { Scheduled: "pending", Completed: "approved", Cancelled: "inactive", "No-show": "rejected" };

function Card({ title, children }) {
  return (
    <div className="bg-paper rounded-sm shadow-card p-5 mb-5">
      <p className={`${LABEL} mb-3`}>{title}</p>
      {children}
    </div>
  );
}

export function NotesCard({ applicationId, notes, onChange }) {
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/careers/applications/${applicationId}/notes`, { body });
      setBody("");
      await onChange();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!confirm("Delete this note?")) return;
    await api.delete(`/api/careers/notes/${id}`);
    await onChange();
  };

  return (
    <Card title={`Notes (${notes.length})`}>
      <form onSubmit={add}>
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Call notes, portfolio impressions, references…" className={INPUT} />
        <button type="submit" disabled={saving || !body.trim()} className="mt-2 px-3 py-1.5 rounded-sm text-xs font-semibold bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40">
          {saving ? "Saving…" : "Add note"}
        </button>
      </form>
      <ul className="mt-4 space-y-3">
        {notes.map((n) => (
          <li key={n.id} className="border-l-2 border-ink/10 pl-3 group">
            <p className="text-sm text-ink whitespace-pre-wrap">{n.body}</p>
            <p className="text-[11px] text-ink/50 font-nums mt-0.5 flex items-center gap-2">
              {n.author} · {formatDateTime(utcToDate(n.created_at))}
              <button type="button" onClick={() => remove(n.id)} className="opacity-0 group-hover:opacity-100 text-rust-500" aria-label="Delete note">
                <Trash2 size={12} />
              </button>
            </p>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Stars({ value, onChange }) {
  return (
    <div className="flex gap-0.5" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} out of 5`}
          onClick={() => onChange(value === n ? null : n)}
          className={n <= (value || 0) ? "text-ochre-500" : "text-ink/20 hover:text-ochre-400"}
        >
          <Star size={18} fill="currentColor" />
        </button>
      ))}
    </div>
  );
}

const EMPTY = { round: "", scheduled_at: "", interviewer: "", mode: "In person", location: "", duration_min: 30, interviewer_email: "", send_emails: 1 };

function InterviewForm({ initial = EMPTY, submitLabel, onSubmit, onCancel, full = false }) {
  const [f, setF] = useState(initial);
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const [avail, setAvail] = useState(null);
  const [checking, setChecking] = useState(false);
  const checkAvail = async () => {
    setChecking(true);
    try {
      const { data } = await api.post("/api/careers/calendar/check", { emails: f.interviewer_email ? [f.interviewer_email] : [], start: f.scheduled_at, duration_min: f.duration_min, exclude_id: initial.id });
      const clash = [...(data.internal || []).map((x) => `${x.email} already has "${x.round}" at ${formatDateTime(x.scheduled_at)}`), ...(data.calendar || []).filter((c) => c.busy).map((c) => `${c.email} is busy on their calendar then`)];
      setAvail(clash.length ? { bad: true, text: clash.join(" · ") } : { text: !f.interviewer_email ? "No interviewer email entered, nothing to check." : data.unknown?.length ? "No clash with other interviews. Their Google Calendar is not shared with careers@, so it could not be checked." : data.configured ? "Interviewer is free at that time." : "No clash with other interviews (calendar not connected yet)." });
    } catch (e) { setAvail({ bad: true, text: e?.response?.data?.detail || "Could not check" }); } finally { setChecking(false); }
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!f.round.trim()) return;
    setSaving(true);
    try {
      await onSubmit(f);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block col-span-2">
          <span className={LABEL}>Round</span>
          <input value={f.round} onChange={set("round")} required placeholder="e.g. Round 1 – HR screen" className={`${INPUT} mt-1`} list="careers-rounds" />
          <datalist id="careers-rounds">
            <option value="Phone screen" />
            <option value="Round 1 – HR" />
            <option value="Round 2 – Hiring manager" />
            <option value="Portfolio review" />
            <option value="Trial day" />
            <option value="Final – Founders" />
          </datalist>
        </label>
        <label className="block">
          <span className={LABEL}>Date & time</span>
          <input type="datetime-local" value={f.scheduled_at || ""} onChange={set("scheduled_at")} className={`${INPUT} mt-1`} />
        </label>
        <label className="block">
          <span className={LABEL}>Mode</span>
          <select value={f.mode || ""} onChange={set("mode")} className={`${INPUT} mt-1`}>
            {INTERVIEW_MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
        <label className="block">
          <span className={LABEL}>Interviewer(s)</span>
          <input value={f.interviewer || ""} onChange={set("interviewer")} className={`${INPUT} mt-1`} />
        </label>
        <label className="block">
          <span className={LABEL}>Location / link</span>
          <input value={f.location || ""} onChange={set("location")} placeholder="Meet link or venue" className={`${INPUT} mt-1`} />
        </label>
        <label className="block">
          <span className={LABEL}>Duration (min)</span>
          <input type="number" min="10" max="480" step="5" value={f.duration_min || 30} onChange={set("duration_min")} className={`${INPUT} mt-1`} />
        </label>
        <label className="block">
          <span className={LABEL}>Interviewer email (cc'd)</span>
          <input type="email" value={f.interviewer_email || ""} onChange={set("interviewer_email")} className={`${INPUT} mt-1`} />
        </label>
        <div className="col-span-2 text-[11px] text-ink/60 -mt-1">
          The candidate and the interviewer both get the invite and reminders from careers@. Video calls get a Google Meet link automatically when the location is left blank.
          <button type="button" disabled={!f.scheduled_at || checking} onClick={checkAvail} className="ml-2 font-semibold text-jade-700 hover:underline disabled:opacity-40">{checking ? "Checking…" : "Check interviewer availability"}</button>
          {avail && <p className={`mt-1 ${avail.bad ? "text-rust-500" : "text-jade-700"}`}>{avail.text}</p>}
        </div>
        <label className="col-span-2 flex items-center gap-2 text-xs text-ink/80">
          <input type="checkbox" checked={f.send_emails !== 0} onChange={(e) => setF({ ...f, send_emails: e.target.checked ? 1 : 0 })} />
          Email the candidate from careers@jadecouture.com (invite, reminders at 24h and 2h, reschedule/cancel notices)
        </label>
      </div>
      {full && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className={LABEL}>Status</span>
              <select value={f.status} onChange={set("status")} className={`${INPUT} mt-1`}>
                {INTERVIEW_STATUSES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={LABEL}>Recommendation</span>
              <select value={f.recommendation || ""} onChange={set("recommendation")} className={`${INPUT} mt-1`}>
                <option value="">—</option>
                {RECOMMENDATIONS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <div>
            <span className={LABEL}>Rating</span>
            <div className="mt-1"><Stars value={f.rating} onChange={(rating) => setF({ ...f, rating })} /></div>
          </div>
          <label className="block">
            <span className={LABEL}>Feedback</span>
            <textarea rows={4} value={f.feedback || ""} onChange={set("feedback")} className={`${INPUT} mt-1`} />
          </label>
        </>
      )}
      <div className="flex gap-2">
        <button type="submit" disabled={saving || !f.round.trim()} className="px-3 py-1.5 rounded-sm text-xs font-semibold bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40">
          {saving ? "Saving…" : submitLabel}
        </button>
        {onCancel && <button type="button" onClick={onCancel} className="px-3 py-1.5 rounded-sm text-xs text-ink/70 hover:text-ink">Cancel</button>}
      </div>
    </form>
  );
}

const MAIL_TONE = { sent: "text-jade-700", pending: "text-ochre-700", failed: "text-rust-500", skipped: "text-ink/50" };
const KIND = { ack: "Thank-you for applying", reply: "Reply", invite: "Invitation", reschedule: "Reschedule notice", cancel: "Cancellation", reminder24: "24h reminder", reminder2: "2h reminder" };

export function EmailsCard({ emails = [], onChange }) {
  const [status, setStatus] = useState(null);
  useEffect(() => { api.get("/api/careers/mail/status").then(({ data }) => setStatus(data)).catch(() => {}); }, [emails.length]);
  const retry = async (id) => { await api.post(`/api/careers/mail/${id}/retry`, {}); await onChange(); };
  if (!emails.length && status?.configured !== false) return null;
  return (
    <Card title={`Emails (${emails.length})`}>
      {status && !status.configured && (
        <p className="text-xs text-ochre-700 mb-2">Sending from {status.sender} is not connected yet. Emails are queued and go out automatically once the mailbox credentials are added.</p>
      )}
      <ul className="space-y-2">
        {emails.map((m) => (
          <li key={m.id} className="text-xs">
            <p className="text-ink">{KIND[m.kind] || m.kind} <span className={`font-semibold ${MAIL_TONE[m.status] || ""}`}>· {m.status}</span></p>
            <p className="text-ink/50 font-nums">{m.sent_at || m.created_at}{m.error ? ` · ${m.error}` : ""}</p>
            {(m.status === "failed" || m.status === "skipped") && <button type="button" onClick={() => retry(m.id)} className="text-jade-700 font-semibold hover:underline">Retry</button>}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function InterviewsCard({ applicationId, interviews, onChange }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const create = async (f) => {
    await api.post(`/api/careers/applications/${applicationId}/interviews`, f);
    setAdding(false);
    await onChange();
  };
  const update = async (id, f) => {
    await api.put(`/api/careers/interviews/${id}`, f);
    setEditingId(null);
    await onChange();
  };
  const remove = async (id) => {
    if (!confirm("Remove this interview?")) return;
    await api.delete(`/api/careers/interviews/${id}`);
    await onChange();
  };

  return (
    <Card title={`Interviews (${interviews.length})`}>
      <div className="space-y-3">
        {interviews.map((i) =>
          editingId === i.id ? (
            <div key={i.id} className="border border-ink/10 rounded-sm p-3">
              <InterviewForm initial={i} full submitLabel="Save" onSubmit={(f) => update(i.id, f)} onCancel={() => setEditingId(null)} />
            </div>
          ) : (
            <div key={i.id} className="border border-ink/10 rounded-sm p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-ink">{i.round}</p>
                  <p className="text-xs text-ink/60 font-nums">
                    {i.scheduled_at ? formatDateTime(i.scheduled_at) : "Time not set"}
                    {i.duration_min ? ` · ${i.duration_min} min` : ""}
                    {i.mode ? ` · ${i.mode}` : ""}
                    {i.interviewer ? ` · ${i.interviewer}` : ""}
                  </p>
                  {i.location && <p className="text-xs text-ink/50 break-all">{i.location}</p>}
                </div>
                <StampBadge status={INTERVIEW_TONE[i.status]}>{i.status}</StampBadge>
              </div>
              {(i.rating || i.recommendation) && (
                <p className="text-xs mt-2 text-ink/80">
                  {i.rating ? <span className="text-ochre-700 font-nums">{"★".repeat(i.rating)}{"☆".repeat(5 - i.rating)}</span> : null}
                  {i.recommendation ? <span className="ml-2 font-semibold">{i.recommendation}</span> : null}
                </p>
              )}
              {i.feedback && <p className="text-xs text-ink/75 mt-1.5 whitespace-pre-wrap">{i.feedback}</p>}
              <div className="flex gap-3 mt-2 text-xs">
                <button type="button" onClick={() => setEditingId(i.id)} className="text-jade-700 font-semibold hover:underline">
                  {i.status === "Scheduled" ? "Add feedback / edit" : "Edit"}
                </button>
                <button type="button" onClick={() => remove(i.id)} className="text-rust-500 hover:underline">Remove</button>
              </div>
            </div>
          )
        )}
      </div>
      {adding ? (
        <div className="mt-3 border border-ink/10 rounded-sm p-3">
          <InterviewForm submitLabel="Schedule" onSubmit={create} onCancel={() => setAdding(false)} />
          <p className="text-[11px] text-ink/50 mt-2">Scheduling moves a New / Shortlisted / Auto-Rejected applicant to Interviewing. The candidate is emailed the invite automatically unless unticked.</p>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-3 px-3 py-1.5 rounded-sm text-xs font-semibold border border-jade-500/40 text-jade-700 hover:bg-jade-500/10">
          + Schedule interview
        </button>
      )}
    </Card>
  );
}

function eventLine(e) {
  if (e.type === "applied") return "Applied";
  if (e.type === "status") return `${e.from_status || "—"} → ${e.to_status}`;
  return e.detail || e.type;
}

export function HistoryCard({ events }) {
  return (
    <Card title="History">
      {events.length === 0 ? (
        <p className="text-sm text-ink/60">No changes logged yet (history starts from 21 Oct 2026).</p>
      ) : (
        <ol className="space-y-2.5">
          {events.map((e) => (
            <li key={e.id} className="text-xs">
              <p className="text-ink">{eventLine(e)}</p>
              {e.type !== "interview" && e.detail && <p className="text-ink/55">{e.detail}</p>}
              <p className="text-ink/45 font-nums">{e.actor} · {formatDateTime(utcToDate(e.created_at))}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
