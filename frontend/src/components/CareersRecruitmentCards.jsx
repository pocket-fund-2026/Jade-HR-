import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../lib/api.js";
import { formatDateTime, utcToDate } from "../lib/careers.js";

const INPUT = "w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500";
const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-ink/50";
const BTN = "px-3 py-1.5 rounded-sm text-xs font-semibold";

function Card({ title, children }) {
  return (
    <div className="bg-paper rounded-sm shadow-card p-5 mb-5">
      <p className={`${LABEL} mb-3`}>{title}</p>
      {children}
    </div>
  );
}

const errText = (e, d) => e?.response?.data?.detail || d;

function MergeView({ id, other, onClose, onMarkDuplicate }) {
  const [v, setV] = useState(null);
  useEffect(() => { api.get(`/api/careers/applications/${id}/merge-view`, { params: { other } }).then(({ data }) => setV(data)); }, [id, other]);
  return (
    <div className="fixed inset-0 z-50 bg-ink/50 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-paper rounded-sm shadow-card w-full max-w-3xl max-h-[92vh] overflow-y-auto p-5" onClick={(e) => e.stopPropagation()}>
        <p className="font-display text-lg text-ink mb-3">Compare the two records</p>
        {!v ? <p className="text-sm text-ink/60">Loading…</p> : (
          <>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-ink/50"><th className="py-1 pr-3 w-32"></th><th className="py-1 pr-3">This record (#{v.a.id})</th><th className="py-1">Other record (#{v.b.id})</th></tr></thead>
              <tbody>
                {v.fields.map((f) => (
                  <tr key={f.field} className={`border-t border-ink/[0.06] align-top ${f.same ? "" : "bg-ochre-500/10"}`}>
                    <td className="py-1.5 pr-3 text-ink/55">{f.field.replace(/_/g, " ")}</td>
                    <td className="py-1.5 pr-3 text-ink break-words">{f.a ?? "—"}</td>
                    <td className="py-1.5 text-ink break-words">{f.b ?? "—"}</td>
                  </tr>
                ))}
                <tr className="border-t border-ink/[0.06]">
                  <td className="py-1.5 pr-3 text-ink/55">on file</td>
                  {["a", "b"].map((k) => <td key={k} className="py-1.5 pr-3 text-ink/80">{v.extras[k].resume ? "CV" : "no CV"} · {v.extras[k].notes} notes · {v.extras[k].interviews} interviews</td>)}
                </tr>
              </tbody>
            </table>
            <p className="text-[11px] text-ink/50 mt-2">Highlighted rows differ. Open either record to keep working on it; the flag only holds the duplicate out of screening and outreach, nothing is deleted.</p>
            <div className="flex gap-2 mt-3 flex-wrap">
              <Link to={`/admin/careers/applicants/${v.b.id}`} className={`${BTN} border border-ink/20 text-ink hover:bg-manila/40`}>Open #{v.b.id}</Link>
              {onMarkDuplicate && <button type="button" onClick={() => onMarkDuplicate(v.b.id)} className={`${BTN} bg-jade-600 text-white hover:bg-jade-700`}>This record is a duplicate of #{v.b.id}</button>}
              <button type="button" onClick={onClose} className={`${BTN} text-ink/70 hover:text-ink ml-auto`}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Duplicate-CV and "refer to recruiter" flags, with one-click mark/clear and a side-by-side view.
export function FlagsCard({ application: a, onChange }) {
  const [matches, setMatches] = useState([]);
  const [compare, setCompare] = useState(null);
  const [recruiter, setRecruiter] = useState({ open: false, name: a.recruiter_name || "", note: a.recruiter_note || "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  useEffect(() => { api.get(`/api/careers/applications/${a.id}/duplicates`).then(({ data }) => setMatches(data.matches || [])).catch(() => {}); }, [a.id, a.dup_of]);

  const act = async (body) => {
    setBusy(true); setErr("");
    try { await api.post(`/api/careers/applications/${a.id}/flags`, body); setCompare(null); await onChange(); }
    catch (e) { setErr(errText(e, "Could not update the flag")); } finally { setBusy(false); }
  };
  const live = matches.filter((m) => m.id !== a.dup_of);
  if (!a.dup_of && !a.refer_recruiter && !matches.length && !recruiter.open) {
    return (
      <Card title="Flags">
        <p className="text-xs text-ink/60 mb-2">No duplicate CV found for this applicant.</p>
        <button type="button" onClick={() => setRecruiter({ ...recruiter, open: true })} className={`${BTN} border border-ink/20 text-ink hover:bg-manila/40`}>Refer to recruiter</button>
      </Card>
    );
  }
  return (
    <Card title="Flags">
      {a.dup_of && (
        <div className="mb-3 border border-ochre-500/40 bg-ochre-500/10 rounded-sm px-3 py-2 text-sm text-ink">
          <strong>Duplicate</strong> of <Link className="underline" to={`/admin/careers/applicants/${a.dup_of}`}>#{a.dup_of}</Link>
          {a.dup_signals && <span className="text-ink/60"> (matched {JSON.parse(a.dup_signals).join(", ")})</span>}. Held out of screening, outreach and interview scheduling.
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={() => setCompare(a.dup_of)} className={`${BTN} border border-ink/20 hover:bg-manila/40`}>Compare records</button>
            <button type="button" disabled={busy} onClick={() => act({ action: "clear_duplicate" })} className={`${BTN} border border-ink/20 hover:bg-manila/40 disabled:opacity-40`}>Not a duplicate: clear flag</button>
          </div>
        </div>
      )}
      {a.refer_recruiter ? (
        <div className="mb-3 border border-ink/15 rounded-sm px-3 py-2 text-sm text-ink">
          <strong>Referred to recruiter:</strong> {a.recruiter_name}{a.recruiter_note ? <span className="text-ink/70"> — {a.recruiter_note}</span> : null}. No automated emails go to this candidate.
          <div className="mt-2"><button type="button" disabled={busy} onClick={() => act({ action: "clear_refer" })} className={`${BTN} border border-ink/20 hover:bg-manila/40 disabled:opacity-40`}>Clear recruiter flag</button></div>
        </div>
      ) : recruiter.open ? (
        <div className="mb-3 space-y-2">
          <input value={recruiter.name} onChange={(e) => setRecruiter({ ...recruiter, name: e.target.value })} placeholder="Recruiter or agency name" className={INPUT} />
          <textarea rows={2} value={recruiter.note} onChange={(e) => setRecruiter({ ...recruiter, note: e.target.value })} placeholder="Note (fee terms, who submitted first…)" className={INPUT} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !recruiter.name.trim()} onClick={() => act({ action: "refer_to_recruiter", recruiter_name: recruiter.name, note: recruiter.note })} className={`${BTN} bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40`}>Save flag</button>
            <button type="button" onClick={() => setRecruiter({ ...recruiter, open: false })} className={`${BTN} text-ink/70`}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setRecruiter({ ...recruiter, open: true })} className={`${BTN} border border-ink/20 text-ink hover:bg-manila/40 mb-3`}>Refer to recruiter</button>
      )}
      {live.length > 0 && (
        <div>
          <p className="text-xs text-ink/60 mb-1.5">Other records that look like the same person:</p>
          <ul className="space-y-1.5">
            {live.map((m) => (
              <li key={m.id} className="text-xs border border-ink/10 rounded-sm px-2.5 py-2">
                <Link to={`/admin/careers/applicants/${m.id}`} className="font-medium text-ink underline">#{m.id} {m.full_name}</Link>
                <span className="text-ink/60"> · {m.job_title} · {m.status}{m.source ? ` · via ${m.source}` : ""}</span>
                <p className="text-ink/55">{m.strength === "strong" ? "Strong" : "Weak"} match: {m.signals.join(", ")}</p>
                <div className="flex gap-3 mt-1">
                  <button type="button" onClick={() => setCompare(m.id)} className="text-jade-700 font-semibold hover:underline">Compare</button>
                  {!a.dup_of && <button type="button" disabled={busy} onClick={() => act({ action: "mark_duplicate", original_id: m.id })} className="text-jade-700 font-semibold hover:underline disabled:opacity-40">Mark this one as duplicate of #{m.id}</button>}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      {err && <p className="text-xs text-rust-500 mt-2">{err}</p>}
      {compare && <MergeView id={a.id} other={compare} onClose={() => setCompare(null)} onMarkDuplicate={!a.dup_of ? (oid) => act({ action: "mark_duplicate", original_id: oid }) : null} />}
    </Card>
  );
}

const STATE_TEXT = { sent: "Sent", partial: "Partly sent", failed: "Failed", not_sent: "Not sent yet", unavailable: "Not recorded" };

// Offer letter + onboarding link dispatch after the applicant accepts; manual resend.
export function DispatchCard({ applicationId, status }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => api.get(`/api/careers/applications/${applicationId}/dispatch`).then(({ data }) => setD(data)).catch(() => {});
  useEffect(() => { load(); }, [applicationId, status]);
  if (!["Offered", "Offer Accepted", "Hired"].includes(status) && !d?.offer_sent_at && !d?.onboarding_sent_at) return null;
  const resend = async (only) => {
    if (!confirm(`Send ${only === "offer" ? "the offer letter" : only === "onboarding" ? "the onboarding form link" : "the offer letter and the onboarding form link"} to the candidate now?`)) return;
    setBusy(only || "both"); setMsg("");
    try {
      const { data } = await api.post(`/api/careers/applications/${applicationId}/dispatch/resend`, only ? { only } : {});
      setMsg(data.errors?.length ? `Some parts failed: ${data.errors.join("; ")}` : "Sent.");
      await load();
    } catch (e) { setMsg(errText(e, "Could not send")); } finally { setBusy(""); }
  };
  const when = (t) => (t ? formatDateTime(new Date(t)) : "not sent");
  return (
    <Card title="Offer & onboarding dispatch">
      {!d ? <p className="text-xs text-ink/60">Loading…</p> : (
        <>
          <p className="text-sm text-ink font-semibold">{STATE_TEXT[d.state] || d.state}</p>
          <p className="text-xs text-ink/70 mt-1">Offer letter: {when(d.offer_sent_at)}</p>
          <p className="text-xs text-ink/70">Onboarding form link: {when(d.onboarding_sent_at)}</p>
          {d.last_error && <p className="text-xs text-rust-500 mt-1">{d.last_error}</p>}
          <p className="text-[11px] text-ink/50 mt-2">
            {d.auto_enabled ? "Both go out automatically once the applicant is marked Offer Accepted or Hired, and are never sent twice." : "Automatic sending is switched off (CAREERS_ACCEPT_DISPATCH), so use Send below."}
            {d.state === "unavailable" && " The dispatch table has not been created yet, so sends are not recorded."}
          </p>
          <div className="flex gap-3 mt-3 flex-wrap">
            <button type="button" disabled={!!busy} onClick={() => resend(null)} className={`${BTN} bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40`}>{busy === "both" ? "Sending…" : d.offer_sent_at || d.onboarding_sent_at ? "Resend both" : "Send both now"}</button>
            <button type="button" disabled={!!busy} onClick={() => resend("offer")} className="text-xs text-jade-700 font-semibold hover:underline disabled:opacity-40">Offer letter only</button>
            <button type="button" disabled={!!busy} onClick={() => resend("onboarding")} className="text-xs text-jade-700 font-semibold hover:underline disabled:opacity-40">Onboarding link only</button>
          </div>
          {msg && <p className="text-xs text-ink/80 mt-2">{msg}</p>}
        </>
      )}
    </Card>
  );
}

// Notes from the first interview (pasted text and/or a link such as a Granola note), visible to the round-2 interviewer.
export function Round2Card({ applicationId, round2, onChange }) {
  const [f, setF] = useState({ notes: round2?.notes || "", source_label: round2?.source_label || "", source_url: round2?.source_url || "" });
  const [mail, setMail] = useState(null); // { to, message }
  const [people, setPeople] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(() => { setF({ notes: round2?.notes || "", source_label: round2?.source_label || "", source_url: round2?.source_url || "" }); }, [round2?.updated_at]);
  useEffect(() => { api.get("/api/careers/interviewers").then(({ data }) => setPeople(data)).catch(() => {}); }, []);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const dirty = (round2?.notes || "") !== f.notes || (round2?.source_url || "") !== f.source_url || (round2?.source_label || "") !== f.source_label;
  const save = async () => {
    setBusy(true); setMsg("");
    try { await api.put(`/api/careers/applications/${applicationId}/round2`, f); setMsg("Saved."); await onChange(); }
    catch (e) { setMsg(errText(e, "Could not save")); } finally { setBusy(false); }
  };
  const send = async () => {
    setBusy(true); setMsg("");
    try { await api.post(`/api/careers/applications/${applicationId}/round2/email`, { to_email: mail.to, message: mail.message }); setMsg(`Emailed to ${mail.to}.`); setMail(null); await onChange(); }
    catch (e) { setMsg(errText(e, "Could not send")); } finally { setBusy(false); }
  };
  return (
    <Card title="Round-2 context (interview notes)">
      <p className="text-[11px] text-ink/55 mb-2">Paste the first-round notes or a link to them (for example a Granola note). The round-2 interviewer sees them in their brief email and here.</p>
      <textarea rows={5} value={f.notes} onChange={set("notes")} placeholder="Key points from round 1, concerns to probe, what to cover next…" className={INPUT} />
      <div className="grid grid-cols-3 gap-2 mt-2">
        <input value={f.source_label} onChange={set("source_label")} placeholder="Source, e.g. Granola" className={INPUT} />
        <input value={f.source_url} onChange={set("source_url")} placeholder="Link to the notes" className={`${INPUT} col-span-2`} />
      </div>
      <div className="flex gap-3 mt-2 items-center flex-wrap">
        <button type="button" disabled={busy || !dirty || (!f.notes.trim() && !f.source_url.trim())} onClick={save} className={`${BTN} bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40`}>Save notes</button>
        {round2?.updated_at && <span className="text-[11px] text-ink/50">Updated {formatDateTime(utcToDate(round2.updated_at))} by {round2.updated_by}</span>}
        {round2?.notes || round2?.source_url ? <button type="button" onClick={() => setMail({ to: "", message: "" })} className="text-xs text-jade-700 font-semibold hover:underline">Email to a colleague</button> : null}
      </div>
      {round2?.emailed_to && <p className="text-[11px] text-ink/50 mt-1">Last emailed to {round2.emailed_to} on {formatDateTime(utcToDate(round2.emailed_at))}.</p>}
      {mail && (
        <div className="mt-3 border border-ink/10 rounded-sm p-3 space-y-2">
          <label className="block"><span className={LABEL}>Send to</span>
            <input type="email" list="r2-people" value={mail.to} onChange={(e) => setMail({ ...mail, to: e.target.value.trim() })} placeholder="Pick or type a colleague's work email" className={`${INPUT} mt-1`} />
            <datalist id="r2-people">{people.map((p) => <option key={p.id} value={p.email}>{p.name} ({p.designation || p.reason})</option>)}</datalist>
          </label>
          <textarea rows={2} value={mail.message} onChange={(e) => setMail({ ...mail, message: e.target.value })} placeholder="Optional message" className={INPUT} />
          <div className="flex gap-2">
            <button type="button" disabled={busy || !mail.to} onClick={send} className={`${BTN} bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40`}>{busy ? "Sending…" : "Send email"}</button>
            <button type="button" onClick={() => setMail(null)} className={`${BTN} text-ink/70`}>Cancel</button>
          </div>
        </div>
      )}
      {msg && <p className="text-xs text-ink/80 mt-2">{msg}</p>}
    </Card>
  );
}
