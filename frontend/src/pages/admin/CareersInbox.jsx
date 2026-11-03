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

  const load = () => api.get("/api/careers/inbox", { params: { q, matched: matched ? "1" : "" } }).then(({ data }) => setData(data));
  useEffect(() => { load(); }, [matched]);
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
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load()} placeholder="Search sender, subject, text" className={`${INPUT} max-w-xs`} />
        <label className="text-xs text-ink/70 flex items-center gap-1"><input type="checkbox" checked={matched} onChange={(e) => setMatched(e.target.checked)} /> Applicants only</label>
        <button type="button" onClick={sync} className="px-3 py-1.5 rounded-sm text-xs font-semibold border border-jade-500/40 text-jade-700 hover:bg-jade-500/10">Check now</button>
        {st?.last_sync && <span className="text-[11px] text-ink/50">Last checked {new Date(st.last_sync).toLocaleTimeString()}</span>}
        {note && <span className="text-xs text-ink/70">{note}</span>}
      </div>
      <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-4">
        <ul className="border border-ink/10 rounded-sm divide-y divide-ink/10 max-h-[70vh] overflow-y-auto">
          {(data?.messages || []).map((m) => (
            <li key={m.id}>
              <button type="button" onClick={() => select(m.id)} className={`w-full text-left px-3 py-2 hover:bg-manila/50 ${open?.id === m.id ? "bg-manila/60" : ""}`}>
                <p className="text-sm text-ink truncate">{m.applicant || m.from_name || m.from_email}</p>
                <p className="text-xs text-ink/80 truncate">{m.subject}</p>
                <p className="text-[11px] text-ink/50 truncate">{new Date(m.date).toLocaleString()} · {m.preview}</p>
              </button>
            </li>
          ))}
          {data && !data.messages.length && <li className="px-3 py-6 text-sm text-ink/60">No messages.</li>}
        </ul>
        <div className="border border-ink/10 rounded-sm p-4 min-h-[200px]">
          {open ? (
            <>
              <p className="font-medium text-ink">{open.subject}</p>
              <p className="text-xs text-ink/60 mb-3">
                {open.from_name ? `${open.from_name} ` : ""}&lt;{open.from_email}&gt; · {new Date(open.date).toLocaleString()}
                {open.application_id && <> · <Link className="text-jade-700 font-semibold hover:underline" to={`/admin/careers/applicants/${open.application_id}`}>{open.applicant}</Link></>}
              </p>
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
