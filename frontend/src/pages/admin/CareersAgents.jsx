import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import CareersNav from "../../components/CareersNav.jsx";
import api from "../../lib/api.js";

const EMAIL_NOTE = {
  held: ["Emails held", "text-ochre-700"],
  live: ["Emails live", "text-jade-700"],
  "live (internal)": ["Internal emails live", "text-jade-700"],
  none: ["Sends no email", "text-ink/50"],
};

// The designated agents behind Careers: what each one does, whether it is on, and what it did lately.
export default function CareersAgents() {
  const [agents, setAgents] = useState(null);
  const [busy, setBusy] = useState("");
  const load = () => api.get("/api/careers/agents").then(({ data }) => setAgents(data));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, []);
  const toggle = async (a) => {
    if (a.enabled && !confirm(`Switch off the ${a.name}? Its automatic work will pause until you switch it back on.`)) return;
    setBusy(a.id);
    try { await api.post(`/api/careers/agents/${a.id}`, { enabled: !a.enabled }); await load(); } finally { setBusy(""); }
  };
  const when = (t) => (t ? new Date(t.replace(" ", "T") + "Z").toLocaleString() : "—");

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-2xl text-ink">Careers — Agents</h2>
        <p className="text-xs text-ink/70 mt-0.5">Each agent has one job. Switch one off to pause it without affecting the others. Decisions (offer, hire, reject) always stay with HR.</p>
      </div>
      <CareersNav />
      <div className="grid md:grid-cols-2 gap-4">
        {(agents || []).map((a) => {
          const [emailLabel, emailTone] = EMAIL_NOTE[a.emails] || [a.emails, "text-ink/60"];
          return (
            <section key={a.id} className={`bg-paper rounded-sm shadow-card p-5 ${a.enabled ? "" : "opacity-70"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-display text-lg text-ink">{a.name}</h3>
                  <p className="text-xs mt-0.5"><span className={`font-semibold ${a.enabled ? "text-jade-700" : "text-rust-500"}`}>{a.enabled ? "On" : "Off"}</span>
                    <span className="text-ink/40"> · </span><span className={emailTone}>{emailLabel}</span>
                    {a.mode && <><span className="text-ink/40"> · </span><span className="text-ink/60">{a.mode}</span></>}</p>
                </div>
                <button type="button" disabled={busy === a.id} onClick={() => toggle(a)}
                  className={`px-3 py-1.5 rounded-sm text-xs font-semibold border ${a.enabled ? "border-ink/20 text-ink/70 hover:bg-manila/60" : "border-jade-500/50 text-jade-700 hover:bg-jade-500/10"}`}>
                  {a.enabled ? "Switch off" : "Switch on"}
                </button>
              </div>
              <p className="text-sm text-ink/80 mt-3">{a.job}</p>
              <p className="text-[11px] text-ink/50 mt-3 font-nums">{a.actions_24h} action{a.actions_24h === 1 ? "" : "s"} in the last 24h · last activity {when(a.last_activity)}</p>
              <ul className="mt-2 space-y-1 border-t border-ink/10 pt-2">
                {a.recent.length === 0 && <li className="text-xs text-ink/50">Nothing yet.</li>}
                {a.recent.map((r) => (
                  <li key={r.id} className="text-xs text-ink/80">
                    <span className="font-medium">{r.action}</span>
                    {r.detail && <span className="text-ink/60"> — {r.detail}</span>}
                    {r.application_id && <> · <Link className="text-jade-700 hover:underline" to={`/admin/careers/applicants/${r.application_id}`}>{r.applicant || "applicant"}</Link></>}
                    <span className="text-ink/40 font-nums"> · {when(r.at)}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
