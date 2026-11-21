import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import CareersNav from "../../components/CareersNav.jsx";
import api from "../../lib/api.js";

const INPUT = "border border-ink/15 rounded-sm px-2 py-1.5 text-sm bg-paper";
// careers rows carry SQLite UTC stamps ("YYYY-MM-DD HH:MM:SS") or ISO strings.
const when = (v) => {
  if (!v) return "";
  const d = new Date(/T/.test(v) ? v : `${String(v).replace(" ", "T")}Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

// Intern applications that came in by email at careers@: filed students (private Internship pool) plus
// intern emails nobody has filed yet. "Search whole mailbox" backfills mail older than the rolling sync.
export default function CareersInternships() {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = () => api.get("/api/careers/internships").then(({ data }) => { setData(data); setError(""); })
    .catch((e) => setError(e.response?.data?.detail || "Could not load internship applications"));
  useEffect(() => { load(); }, []);

  const backfill = async () => {
    setBusy(true); setNote("Searching the whole careers@ mailbox for internship emails…");
    try {
      let { data: r } = await api.post("/api/careers/internships/backfill", {});
      while (r.running) {
        setNote(`Reading mailbox… ${r.scanned} internship email(s) checked, ${r.added} new.`);
        await new Promise((ok) => setTimeout(ok, 3000));
        ({ data: r } = await api.get("/api/careers/internships/backfill"));
      }
      if (r.error) throw new Error(r.error);
      setNote(`Mailbox searched: ${r.scanned} found, ${r.added} new. Filing students…`);
      await api.post("/api/careers/agent/run", {});
      setNote(`Done: ${r.scanned} internship email(s) found, ${r.added} new. New students are filed below.`);
    } catch (e) { setNote(e.response?.data?.detail || e.message || "Mailbox search failed"); }
    finally { setBusy(false); await load(); }
  };
  const addApplicant = async (m) => {
    try { await api.post(`/api/careers/inbox/${m.id}/create-applicant`, { job_id: data.pool_job_id }); await load(); }
    catch (e) { setNote(e.response?.data?.detail || "Could not file this email"); }
  };

  const statuses = useMemo(() => ["all", ...Array.from(new Set((data?.applicants || []).map((a) => a.status)))], [data]);
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.applicants || []).filter((a) =>
      (status === "all" || a.status === status)
      && (!term || `${a.full_name} ${a.email} ${a.phone} ${a.city} ${a.education} ${a.course} ${a.mail_subject}`.toLowerCase().includes(term)));
  }, [data, q, status]);

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-2xl text-ink">Careers — Internships</h2>
        <p className="text-xs text-ink/70 mt-0.5">Students who wrote to careers@jadecouture.com about an internship or graduation project. Filed automatically into a private pool, never a public role.</p>
      </div>
      <CareersNav />
      {error && <p className="text-xs text-rust-500 mb-3">{error}</p>}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, college, course" className={`${INPUT} w-72`} />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={INPUT}>
          {statuses.map((s) => <option key={s} value={s}>{s === "all" ? "All statuses" : s}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={backfill} className="px-3 py-1.5 rounded-sm text-xs font-semibold border border-jade-500/40 text-jade-700 hover:bg-jade-500/10 disabled:opacity-40">Search whole mailbox</button>
        {note && <span className="text-xs text-ink/70">{note}</span>}
      </div>

      {data?.unfiled?.length > 0 && (
        <div className="mb-5 border border-ochre-500/40 rounded-sm bg-manila/40">
          <p className="px-3 py-2 text-xs font-semibold text-ochre-700">{data.unfiled.length} internship email(s) not filed yet</p>
          <ul className="divide-y divide-ink/10">
            {data.unfiled.map((m) => (
              <li key={m.id} className="px-3 py-2 flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink truncate">{m.from_name || m.from_email} <span className="text-ink/50 text-xs">&lt;{m.from_email}&gt;</span></p>
                  <p className="text-xs text-ink/70 truncate">{m.subject} · {when(m.date)}</p>
                </div>
                <Link to="/admin/careers/inbox" className="text-xs text-ink/60 hover:text-ink">Open in Inbox</Link>
                <button type="button" onClick={() => addApplicant(m)} className="px-2.5 py-1 rounded-sm text-xs font-semibold bg-jade-600 text-white hover:bg-jade-700">File as intern applicant</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-ink/60 mb-2">{data ? `${shown.length} of ${data.applicants.length} intern applicant(s)` : "Loading…"}</p>
      <div className="border border-ink/10 rounded-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-manila/50 text-left text-xs text-ink/70">
            <tr><th className="px-3 py-2">Student</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">College / course</th><th className="px-3 py-2">Email received</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">CV</th></tr>
          </thead>
          <tbody className="divide-y divide-ink/10">
            {shown.map((a) => (
              <tr key={a.id} className="hover:bg-manila/30">
                <td className="px-3 py-2"><Link className="text-jade-700 font-semibold hover:underline" to={`/admin/careers/applicants/${a.id}`}>{a.full_name}</Link><p className="text-[11px] text-ink/50">{a.job_title}</p></td>
                <td className="px-3 py-2 text-xs"><p>{a.email}</p><p className="text-ink/60">{a.phone}{a.city ? ` · ${a.city}` : ""}</p></td>
                <td className="px-3 py-2 text-xs">{[a.education, a.course, a.study_stage].filter(Boolean).join(" · ") || <span className="text-ink/40">—</span>}</td>
                <td className="px-3 py-2 text-xs"><p className="truncate max-w-[16rem]">{a.mail_subject || "—"}</p><p className="text-ink/50">{when(a.mail_date || a.created_at)}{a.mail_count > 1 ? ` · ${a.mail_count} emails` : ""}</p></td>
                <td className="px-3 py-2 text-xs">{a.status}</td>
                <td className="px-3 py-2 text-xs">{a.attachments || a.resume_path ? "Yes" : <span className="text-ink/40">—</span>}</td>
              </tr>
            ))}
            {data && !shown.length && <tr><td colSpan={6} className="px-3 py-6 text-ink/60">No intern applications match.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
