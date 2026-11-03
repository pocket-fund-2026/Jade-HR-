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

const MAIL_TONE = { sent: "text-jade-700", pending: "text-ochre-700", draft: "text-ochre-700", failed: "text-rust-500", skipped: "text-ink/50", discarded: "text-ink/50" };
const KIND = { shortlisted: "Shortlisted: interview times (second mail)", offer: "Interview times offered", offer_nudge: "Reminder to pick a time", prep: "Interviewer brief", assign_reminder: "Assignment reminder", assign_closed: "Assignment window closed", digest: "Weekly digest", ack: "Thank-you for applying", received: "Assignment received", offered: "Offer", hired: "Welcome to JADE", rejected: "Application update (decline)", reply: "Reply", invite: "Invitation", reschedule: "Reschedule notice", cancel: "Cancellation", reminder24: "24h reminder", reminder2: "2h reminder" };

export function EmailsCard({ emails = [], onChange }) {
  const [status, setStatus] = useState(null);
  useEffect(() => { api.get("/api/careers/mail/status").then(({ data }) => setStatus(data)).catch(() => {}); }, [emails.length]);
  const retry = async (id) => { await api.post(`/api/careers/mail/${id}/retry`, {}); await onChange(); };
  const [draft, setDraft] = useState(null); // { id, subject, note, html, to }
  const [busy, setBusy] = useState(false);
  const [sl, setSl] = useState(null); // shortlist form: { id, f }
  const [slErr, setSlErr] = useState("");
  const [slBusy, setSlBusy] = useState(false);
  const [slAvail, setSlAvail] = useState(null);
  const openShortlist = (id) => { setSlErr(""); setSlAvail(null); setSl({ id, f: { round: "Round 1 – HR", mode: "Video call", duration_min: 30, interviewer: "", interviewer_email: "", note: "", slots: ["", ""] } }); };
  const slSet = (k) => (e) => setSl({ ...sl, f: { ...sl.f, [k]: e.target.value } });
  const slFilled = sl ? sl.f.slots.filter(Boolean) : [];
  const slCheck = async () => {
    setSlAvail({ text: "Checking…" });
    try {
      const res = await Promise.all(slFilled.map((start) => api.post("/api/careers/calendar/check", { emails: sl.f.interviewer_email ? [sl.f.interviewer_email] : [], start, duration_min: sl.f.duration_min }).then((r) => ({ start, ...r.data }))));
      const bad = res.flatMap((r) => [...(r.internal || []).map((x) => `${formatDateTime(r.start)}: ${x.email} already has "${x.round}"`), ...(r.calendar || []).filter((c) => c.busy).map((c) => `${formatDateTime(r.start)}: ${c.email} is busy on their calendar`)]);
      setSlAvail(bad.length ? { bad: true, text: bad.join(" · ") } : { text: !sl.f.interviewer_email ? "No interviewer email entered, nothing to check." : "Interviewer looks free at all of these times." });
    } catch (e) { setSlAvail({ bad: true, text: e?.response?.data?.detail || "Could not check" }); }
  };
  const slSend = async () => {
    if (!confirm("Send the interview-times email to the candidate from careers@jadecouture.com now?")) return;
    setSlBusy(true); setSlErr("");
    try { await api.post(`/api/careers/mail/${sl.id}/send-shortlist`, { ...sl.f, slots: slFilled }); setSl(null); await onChange(); }
    catch (e) { setSlErr(e?.response?.data?.detail || "Could not send"); } finally { setSlBusy(false); }
  };
  const openDraft = async (id) => { const { data } = await api.get(`/api/careers/mail/${id}`); setDraft({ id, subject: data.subject, note: data.payload?.note || "", html: data.body_html, to: data.to_email }); };
  const refreshPreview = async () => { setBusy(true); try { await api.put(`/api/careers/mail/${draft.id}/draft`, { subject: draft.subject, note: draft.note }); await openDraft(draft.id); } finally { setBusy(false); } };
  const sendDraft = async () => {
    if (!confirm(`Send this email to ${draft.to} from careers@jadecouture.com now?`)) return;
    setBusy(true);
    try { await api.put(`/api/careers/mail/${draft.id}/draft`, { subject: draft.subject, note: draft.note }); await api.post(`/api/careers/mail/${draft.id}/send`, {}); setDraft(null); await onChange(); }
    catch (e) { alert(e?.response?.data?.detail || "Could not send"); } finally { setBusy(false); }
  };
  const discard = async (id) => { if (!confirm("Discard this draft? Nothing will be sent.")) return; await api.delete(`/api/careers/mail/${id}/draft`); setDraft(null); await onChange(); };
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
            {m.status === "draft" && (
              <p className="mt-0.5">
                <span className="text-ink/60">Not sent yet. </span>
                <button type="button" onClick={() => (m.kind === "shortlisted" ? openShortlist(m.id) : openDraft(m.id))} className="text-jade-700 font-semibold hover:underline">{m.kind === "shortlisted" ? "Add interview times & send" : "Review & send"}</button>
                <button type="button" onClick={() => discard(m.id)} className="ml-3 text-rust-500 hover:underline">Discard</button>
              </p>
            )}
          </li>
        ))}
      </ul>
      {sl && (
        <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-3" onClick={() => !slBusy && setSl(null)}>
          <div className="bg-paper rounded-sm shadow-card w-full max-w-xl max-h-[92vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-1">Second mail: interview times</p>
            <p className="text-xs text-ink/70 mb-3">The candidate gets one email with a button for each time. They tap one, confirm, and the interview is booked (Meet link for video calls). The interviewer receives the invite and a brief.</p>
            <div className="grid grid-cols-2 gap-3">
              <label className="block col-span-2"><span className={LABEL}>Round</span><input value={sl.f.round} onChange={slSet("round")} className={`${INPUT} mt-1`} list="careers-rounds" /></label>
              <label className="block"><span className={LABEL}>Mode</span><select value={sl.f.mode} onChange={slSet("mode")} className={`${INPUT} mt-1`}>{INTERVIEW_MODES.map((m) => <option key={m}>{m}</option>)}</select></label>
              <label className="block"><span className={LABEL}>Duration (min)</span><input type="number" min="10" max="480" step="5" value={sl.f.duration_min} onChange={slSet("duration_min")} className={`${INPUT} mt-1`} /></label>
              <label className="block"><span className={LABEL}>Interviewer</span><input value={sl.f.interviewer} onChange={slSet("interviewer")} className={`${INPUT} mt-1`} /></label>
              <label className="block"><span className={LABEL}>Interviewer email (gets invite + brief)</span><input type="email" value={sl.f.interviewer_email} onChange={slSet("interviewer_email")} className={`${INPUT} mt-1`} /></label>
            </div>
            <div className="mt-3">
              <span className={LABEL}>Times to offer (1–6, IST)</span>
              {sl.f.slots.map((v, i) => (
                <div key={i} className="flex gap-2 mt-1.5">
                  <input type="datetime-local" value={v} onChange={(e) => setSl({ ...sl, f: { ...sl.f, slots: sl.f.slots.map((x, j) => (j === i ? e.target.value : x)) } })} className={INPUT} />
                  {sl.f.slots.length > 1 && <button type="button" onClick={() => setSl({ ...sl, f: { ...sl.f, slots: sl.f.slots.filter((_, j) => j !== i) } })} className="text-xs text-rust-500 px-1">✕</button>}
                </div>
              ))}
              <div className="flex gap-4 mt-2 text-xs">
                {sl.f.slots.length < 6 && <button type="button" onClick={() => setSl({ ...sl, f: { ...sl.f, slots: [...sl.f.slots, ""] } })} className="text-jade-700 font-semibold hover:underline">+ Add another time</button>}
                <button type="button" disabled={!slFilled.length} onClick={slCheck} className="text-jade-700 font-semibold hover:underline disabled:opacity-40">Check interviewer availability</button>
              </div>
              {slAvail && <p className={`text-[11px] mt-1 ${slAvail.bad ? "text-rust-500" : "text-jade-700"}`}>{slAvail.text}</p>}
            </div>
            <label className="block mt-3"><span className={LABEL}>Personal note (optional)</span><textarea rows={2} value={sl.f.note} onChange={slSet("note")} className={`${INPUT} mt-1`} /></label>
            {slErr && <p className="text-xs text-rust-500 mt-2">{slErr}</p>}
            <div className="flex gap-2 mt-3">
              <button type="button" disabled={slBusy || !slFilled.length || !sl.f.round.trim()} onClick={slSend} className="px-3 py-1.5 rounded-sm text-xs font-semibold bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40">{slBusy ? "Sending…" : "Send interview times"}</button>
              <button type="button" disabled={slBusy} onClick={() => setSl(null)} className="px-3 py-1.5 rounded-sm text-xs text-ink/70 hover:text-ink">Close</button>
              <button type="button" disabled={slBusy} onClick={() => discard(sl.id).then(() => setSl(null))} className="ml-auto px-3 py-1.5 rounded-sm text-xs text-rust-500 hover:underline">Discard draft</button>
            </div>
          </div>
        </div>
      )}
      {draft && (
        <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-3" onClick={() => !busy && setDraft(null)}>
          <div className="bg-paper rounded-sm shadow-card w-full max-w-3xl max-h-[92vh] overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">Review email to {draft.to}</p>
            <label className="block mb-2"><span className={LABEL}>Subject</span><input value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className={`${INPUT} mt-1`} /></label>
            <label className="block mb-2"><span className={LABEL}>Personal note (optional, shown inside the email)</span><textarea rows={3} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className={`${INPUT} mt-1`} placeholder="e.g. We loved your portfolio." /></label>
            <button type="button" disabled={busy} onClick={refreshPreview} className="mb-2 text-xs font-semibold text-jade-700 hover:underline">Update preview</button>
            <iframe title="Email preview" sandbox="" srcDoc={draft.html} className="w-full h-[52vh] border border-ink/10 rounded-sm bg-white" />
            <div className="flex gap-2 mt-3">
              <button type="button" disabled={busy} onClick={sendDraft} className="px-3 py-1.5 rounded-sm text-xs font-semibold bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40">{busy ? "Working…" : "Send from careers@"}</button>
              <button type="button" disabled={busy} onClick={() => setDraft(null)} className="px-3 py-1.5 rounded-sm text-xs text-ink/70 hover:text-ink">Close</button>
              <button type="button" disabled={busy} onClick={() => discard(draft.id)} className="ml-auto px-3 py-1.5 rounded-sm text-xs text-rust-500 hover:underline">Discard draft</button>
            </div>
          </div>
        </div>
      )}
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

const OFFER_TONE = { open: "text-ochre-700", booked: "text-jade-700", expired: "text-ink/50", cancelled: "text-ink/50" };
const fmtSlot = (s) => (s ? formatDateTime(s) : "");

// HR proposes up to 6 times; the candidate gets a private link and picks one (see the Scheduler Agent).
export function OffersCard({ applicationId, onChange }) {
  const [offers, setOffers] = useState([]);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ round: "", mode: "Video call", duration_min: 30, interviewer: "", interviewer_email: "", note: "", slots: ["", ""] });
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);
  const [avail, setAvail] = useState(null);
  const load = () => api.get(`/api/careers/applications/${applicationId}/offers`).then(({ data }) => setOffers(data)).catch(() => {});
  useEffect(() => { load(); }, [applicationId]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const setSlot = (i, v) => setF({ ...f, slots: f.slots.map((x, j) => (j === i ? v : x)) });
  const filled = f.slots.filter(Boolean);

  const check = async () => {
    setAvail({ text: "Checking…" });
    try {
      const res = await Promise.all(filled.map((start) => api.post("/api/careers/calendar/check", { emails: f.interviewer_email ? [f.interviewer_email] : [], start, duration_min: f.duration_min }).then((r) => ({ start, ...r.data }))));
      const bad = res.flatMap((r) => [...(r.internal || []).map((x) => `${fmtSlot(r.start)}: ${x.email} already has "${x.round}"`), ...(r.calendar || []).filter((c) => c.busy).map((c) => `${fmtSlot(r.start)}: ${c.email} is busy on their calendar`)]);
      setAvail(bad.length ? { bad: true, text: bad.join(" · ") } : { text: !f.interviewer_email ? "No interviewer email entered, nothing to check." : "Interviewer looks free at all of these times." });
    } catch (e) { setAvail({ bad: true, text: e?.response?.data?.detail || "Could not check" }); }
  };
  const submit = async (e) => {
    e.preventDefault(); setErr(""); setSaving(true);
    try { await api.post(`/api/careers/applications/${applicationId}/offers`, { ...f, slots: filled }); setAdding(false); setAvail(null); setF({ ...f, slots: ["", ""], note: "" }); await load(); await onChange?.(); }
    catch (e2) { setErr(e2?.response?.data?.detail || "Could not create the offer"); } finally { setSaving(false); }
  };
  const act = async (path, confirmText) => { if (confirmText && !confirm(confirmText)) return; try { await api.post(path, {}); } catch (e) { alert(e?.response?.data?.detail || "Failed"); } await load(); await onChange?.(); };
  const copy = (t) => navigator.clipboard?.writeText(t);

  return (
    <Card title="Offer times to the candidate">
      <ul className="space-y-2">
        {offers.map((o) => (
          <li key={o.id} className="border border-ink/10 rounded-sm p-3 text-xs">
            <p className="text-ink font-medium">{o.round} <span className={`font-semibold ${OFFER_TONE[o.status] || ""}`}>· {o.status}</span></p>
            <p className="text-ink/60 font-nums mt-0.5">{o.status === "booked" ? `Chose ${fmtSlot(o.chosen_slot)}` : o.slots.map(fmtSlot).join("  ·  ")}</p>
            {o.status === "open" && (
              <p className="mt-1.5 flex gap-3 flex-wrap">
                <button type="button" onClick={() => copy(o.link)} className="text-jade-700 font-semibold hover:underline">Copy link</button>
                <button type="button" onClick={() => act(`/api/careers/offers/${o.id}/resend`)} className="text-jade-700 hover:underline">Resend email</button>
                <button type="button" onClick={() => act(`/api/careers/offers/${o.id}/cancel`, "Withdraw this offer?")} className="text-rust-500 hover:underline">Withdraw</button>
              </p>
            )}
          </li>
        ))}
      </ul>
      {adding ? (
        <form onSubmit={submit} className="mt-3 border border-ink/10 rounded-sm p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block col-span-2"><span className={LABEL}>Round</span><input required value={f.round} onChange={set("round")} className={`${INPUT} mt-1`} list="careers-rounds" placeholder="e.g. Round 1 – HR" /></label>
            <label className="block"><span className={LABEL}>Mode</span><select value={f.mode} onChange={set("mode")} className={`${INPUT} mt-1`}>{INTERVIEW_MODES.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label className="block"><span className={LABEL}>Duration (min)</span><input type="number" min="10" max="480" step="5" value={f.duration_min} onChange={set("duration_min")} className={`${INPUT} mt-1`} /></label>
            <label className="block"><span className={LABEL}>Interviewer</span><input value={f.interviewer} onChange={set("interviewer")} className={`${INPUT} mt-1`} /></label>
            <label className="block"><span className={LABEL}>Interviewer email (gets the invite + brief)</span><input type="email" value={f.interviewer_email} onChange={set("interviewer_email")} className={`${INPUT} mt-1`} /></label>
          </div>
          <div>
            <span className={LABEL}>Times to offer (1–6, IST)</span>
            {f.slots.map((v, i) => (
              <div key={i} className="flex gap-2 mt-1.5">
                <input type="datetime-local" value={v} onChange={(e) => setSlot(i, e.target.value)} className={INPUT} />
                {f.slots.length > 1 && <button type="button" onClick={() => setF({ ...f, slots: f.slots.filter((_, j) => j !== i) })} className="text-xs text-rust-500 px-1">✕</button>}
              </div>
            ))}
            <div className="flex gap-4 mt-2 text-xs">
              {f.slots.length < 6 && <button type="button" onClick={() => setF({ ...f, slots: [...f.slots, ""] })} className="text-jade-700 font-semibold hover:underline">+ Add another time</button>}
              <button type="button" disabled={!filled.length} onClick={check} className="text-jade-700 font-semibold hover:underline disabled:opacity-40">Check interviewer availability</button>
            </div>
            {avail && <p className={`text-[11px] mt-1 ${avail.bad ? "text-rust-500" : "text-jade-700"}`}>{avail.text}</p>}
          </div>
          <label className="block"><span className={LABEL}>Personal note (optional)</span><textarea rows={2} value={f.note} onChange={set("note")} className={`${INPUT} mt-1`} /></label>
          {err && <p className="text-xs text-rust-500">{err}</p>}
          <div className="flex gap-2">
            <button type="submit" disabled={saving || !filled.length || !f.round.trim()} className="px-3 py-1.5 rounded-sm text-xs font-semibold bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40">{saving ? "Saving…" : "Send times to candidate"}</button>
            <button type="button" onClick={() => setAdding(false)} className="px-3 py-1.5 rounded-sm text-xs text-ink/70 hover:text-ink">Cancel</button>
          </div>
          <p className="text-[11px] text-ink/50">The candidate gets an email with a button for each time; tapping one and confirming books the interview automatically (Meet link for video calls), and the interviewer gets a brief. If interview emails are switched off, copy the link and share it yourself.</p>
        </form>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="mt-3 px-3 py-1.5 rounded-sm text-xs font-semibold border border-jade-500/40 text-jade-700 hover:bg-jade-500/10">+ Offer times</button>
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
