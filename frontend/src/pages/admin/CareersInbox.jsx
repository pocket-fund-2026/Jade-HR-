import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import CareersNav from "../../components/CareersNav.jsx";
import api from "../../lib/api.js";

const INPUT = "w-full border border-ink/15 rounded-sm px-2 py-1.5 text-sm bg-paper";

// Shared careers@jadecouture.com inbox: replies from candidates, matched to applicants, with reply from careers@.
export default function CareersInbox() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [matched, setMatched] = useState(false);
  const [open, setOpen] = useState(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("all");
  const [agent, setAgent] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [pickJob, setPickJob] = useState("");

  const load = () => api.get("/api/careers/inbox", { params: { q, matched: matched ? "1" : "" } }).then(({ data }) => setData(data));
  const loadAgent = () => api.get("/api/careers/agent/status").then(({ data }) => setAgent(data)).catch(() => {});
  useEffect(() => { load(); }, [matched]);
  useEffect(() => { loadAgent(); api.get("/api/careers/jobs").then(({ data }) => setJobs(data.filter((j) => j.is_active))).catch(() => {}); }, []);
  const runAgent = async () => { setNote("Agent reading the inbox…"); try { const { data } = await api.post("/api/careers/agent/run", {}); setNote(`Agent done: ${data.created || 0} applicant(s) filed, ${data.review || 0} need a look.`); } catch { setNote("Agent run failed"); } await load(); loadAgent(); };
  const addApplicant = async () => {
    try { const { data } = await api.post(`/api/careers/inbox/${open.id}/create-applicant`, { job_id: Number(pickJob) }); setNote(data.existing ? "Already an applicant for that role." : "Added to Careers as a new applicant."); await load(); await select(open.id); }
    catch (e) { setNote(e?.response?.data?.detail || "Could not add"); }
  };
  const dismiss = async () => { await api.post(`/api/careers/inbox/${open.id}/dismiss`, {}); setNote("Marked as handled."); await load(); await select(open.id); loadAgent(); };
  const info = (m) => { try { return m.agent_json ? JSON.parse(m.agent_json) : null; } catch { return null; } };
  const tag = (m) => (m.created_application_id ? ["Filed by agent", "text-jade-700"] : m.agent_status === "review" ? ["Needs review", "text-ochre-700"] : m.agent_category === "vendor" ? ["Vendor", "text-ink/50"] : m.agent_category === "bulk" ? ["Automated", "text-ink/50"] : null);
  const shown = (data?.messages || []).filter((m) => filter === "all" ? true : filter === "review" ? m.agent_status === "review" && !m.application_id : filter === "filed" ? !!m.created_application_id : !!m.application_id);
  const select = async (id) => { const { data } = await api.get(`/api/careers/inbox/${id}`); setOpen(data); setReply(""); setNote(""); };
  const sync = async () => { setNote("Checking mailbox…"); await api.post("/api/careers/inbox/sync", {}); await load(); setNote(""); };
  const send = async () => {
    setSending(true);
    try {
      await api.post("/api/careers/mail/send", {
        application_id: open.application_id, to: open.from_email,
        subject: /^re:/i.test(open.subject) ? open.subject : `Re: ${open.subject}`, text: reply,
      });
      setReply(""); setNote("Reply queued — sending from careers@ now.");
    } catch (e) { setNote(e?.response?.data?.detail || "Could not send"); }
    finally { setSending(false); }
  };
  const st = data?.status;

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-2xl text-ink">Careers — Inbox</h2>
        <p className="text-xs text-ink/70 mt-0.5">Mail received at careers@jadecouture.com, matched to applicants by email address.</p>
      </div>
      <CareersNav />
      {st && !st.configured && <p className="text-xs text-ochre-700 mb-3">The mailbox is not connected yet. Messages will appear here once the careers@ login is added on the server.</p>}
      {st?.last_error && <p className="text-xs text-rust-500 mb-3">Last sync error: {st.last_error}</p>}
      {agent && (
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs border border-ink/10 rounded-sm px-3 py-2 bg-manila/40">
          <span className="font-semibold text-ink">Inbox agent</span>
          <span className="text-ink/70">{agent.mode === "on" ? "files applicants automatically" : agent.mode === "suggest" ? "suggest only" : "off"} · {agent.engine === "claude" ? "Claude" : "rules"}</span>
          <span className="text-ink/60">{agent.counts?.review || 0} need review · {agent.counts?.pending || 0} waiting</span>
          <button type="button" onClick={runAgent} className="ml-auto px-2.5 py-1 rounded-sm font-semibold border border-jade-500/40 text-jade-700 hover:bg-jade-500/10">Run now</button>
        </div>
      )}
      <div className="flex gap-1.5 mb-3 text-xs">
        {[["all", "All"], ["review", "Needs review"], ["filed", "Filed by agent"], ["applicants", "Applicants"]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => setFilter(k)} className={`px-2.5 py-1 rounded-sm border ${filter === k ? "bg-ink text-paper border-ink" : "border-ink/15 text-ink/70 hover:bg-manila/50"}`}>{l}</button>
        ))}
      </div>
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search sender, subject, text" className={`${INPUT} max-w-xs`} />
        <label className="text-xs text-ink/70 flex items-center gap-1"><input type="checkbox" checked={matched} onChange={(e) => setMatched(e.target.checked)} /> Applicants only</label>
        <button type="button" onClick={sync} className="px-3 py-1.5 rounded-sm text-xs font-semibold border border-jade-500/40 text-jade-700 hover:bg-jade-500/10">Check now</button>
        {st?.last_sync && <span className="text-[11px] text-ink/50">Last checked {new Date(st.last_sync).toLocaleTimeString()}</span>}
        {note && <span className="text-xs text-ink/70">{note}</span>}
      </div>
      <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
        <ul className="border border-ink/10 rounded-sm divide-y divide-ink/10 max-h-[70vh] overflow-y-auto">
          {shown.map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => select(m.id)} className={`w-full text-left px-3 py-2 hover:bg-manila/50 ${open?.id === m.id ? "bg-manila/60" : ""}`}>
                <p className="text-sm text-ink truncate">{m.applicant || m.from_name || m.from_email}</p>
                <p className="text-xs text-ink/80 truncate">{m.subject}</p>
                <p className="text-[11px] text-ink/50 truncate">{tag(m) && <span className={`font-semibold ${tag(m)[1]}`}>{tag(m)[0]} · </span>}{new Date(m.date).toLocaleString()} · {m.preview}</p>
              </button>
            </li>
          ))}
          {data && !shown.length && <li className="px-3 py-6 text-sm text-ink/60">No messages.</li>}
        </ul>
        <div className="border border-ink/10 rounded-sm p-4 min-h-[200px]">
          {open ? (
            <>
              <p className="font-medium text-ink">{open.subject}</p>
              <p className="text-xs text-ink/60 mb-3">
                {open.from_name ? `${open.from_name} ` : ""}&lt;{open.from_email}&gt; · {new Date(open.date).toLocaleString()}
                {open.application_id && <> · <Link className="text-jade-700 font-semibold hover:underline" to={`/admin/careers/applicants/${open.application_id}`}>{open.applicant}</Link></>}
              </p>
              {info(open) && (
                <div className="mb-3 border border-ink/10 rounded-sm bg-manila/40 px-3 py-2 text-xs">
                  <p className="font-semibold text-ink">Agent: {info(open).category?.replace("_", " ")}{info(open).confidence != null ? ` (${Math.round(info(open).confidence * 100)}%)` : ""}{open.created_application_id ? " — filed as an applicant" : ""}</p>
                  {info(open).summary && <p className="text-ink/80 mt-0.5">{info(open).summary}</p>}
                  {info(open).reason && <p className="text-ink/60 mt-0.5">{info(open).reason}</p>}
                  {open.attachments?.length > 0 && <p className="text-ink/60 mt-0.5">Attached: {open.attachments.map((a) => a.original_name).join(", ")}</p>}
                  {open.agent_status === "review" && !open.application_id && (
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <select value={pickJob} onChange={(e) => setPickJob(e.target.value)} className="border border-ink/15 rounded-sm px-2 py-1 bg-paper">
                        <option value="">File under which role…</option>
                        {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
                      </select>
                      <button type="button" disabled={!pickJob} onClick={addApplicant} className="px-2.5 py-1 rounded-sm font-semibold bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40">Add as applicant</button>
                      <button type="button" onClick={dismiss} className="px-2.5 py-1 rounded-sm text-ink/70 hover:text-ink">Not a candidate</button>
                    </div>
                  )}
                </div>
              )}
              <pre className="whitespace-pre-wrap text-sm text-ink font-sans">{open.body_text}</pre>
              <div className="mt-4 border-t border-ink/10 pt-3">
                <textarea rows={5} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={`Reply to ${open.from_email}`} className={INPUT} />
                <button type="button" disabled={sending || !reply.trim()} onClick={send} className="mt-2 px-3 py-1.5 rounded-sm text-xs font-semibold bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40">
                  {sending ? "Sending…" : "Send reply from careers@"}
                </button>
              </div>
            </>
          ) : <p className="text-sm text-ink/50">Select a message.</p>}
        </div>
      </div>
    </div>
  );
}
