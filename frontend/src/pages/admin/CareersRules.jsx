import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import CareersNav from "../../components/CareersNav.jsx";
import api from "../../lib/api.js";

const INPUT = "w-full rounded-sm border border-ink/15 bg-paper px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500";
const LABEL = "text-[11px] font-semibold uppercase tracking-wider text-ink/50";
const BTN = "px-3 py-1.5 rounded-sm text-xs font-semibold";
const TYPE_LABEL = { min_experience: "Minimum experience", required_keywords: "Required keywords / skills", location: "Location", max_notice_period: "Maximum notice period", missing_fields: "Missing mandatory fields" };
const FIELD_OPTIONS = { phone: "Phone", city: "Current city", resume: "Resume", current_ctc: "Current CTC", expected_ctc: "Expected CTC", linkedin_url: "LinkedIn", portfolio: "Portfolio", education: "Education", reason_to_leave: "Reason for leaving" };
const BLANK = { name: "", type: "min_experience", params: { years: 2 }, job_id: null, enabled: false, priority: 100 };
const DEFAULT_PARAMS = {
  min_experience: { years: 2, reject_unknown: false },
  required_keywords: { keywords: [], match: "any" },
  location: { allowed: [], allow_relocate: true },
  max_notice_period: { days: 60 },
  missing_fields: { fields: ["phone", "city", "resume"] },
};
const toList = (t) => t.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

function describe(r) {
  const p = r.params || {};
  if (r.type === "min_experience") return `Reject if stated experience is under ${p.years} years${p.reject_unknown ? " (or not stated)" : ""}`;
  if (r.type === "required_keywords") return `Reject unless ${p.match === "all" ? "all" : "any"} of: ${(p.keywords || []).join(", ")}`;
  if (r.type === "location") return `Reject if not in ${(p.allowed || []).join(", ")}${p.allow_relocate ? " (unless willing to relocate)" : ""}`;
  if (r.type === "max_notice_period") return `Reject if notice period is over ${p.days} days`;
  return `Reject if missing: ${(p.fields || []).map((f) => FIELD_OPTIONS[f] || f).join(", ")}`;
}

function ParamEditor({ rule, setRule }) {
  const p = rule.params;
  const setP = (patch) => setRule({ ...rule, params: { ...p, ...patch } });
  if (rule.type === "min_experience") return (
    <div className="grid grid-cols-2 gap-3">
      <label className="block"><span className={LABEL}>Minimum years</span><input type="number" min="0" max="40" step="0.5" value={p.years ?? 0} onChange={(e) => setP({ years: Number(e.target.value) })} className={`${INPUT} mt-1`} /></label>
      <label className="flex items-end gap-2 text-xs text-ink/80 pb-2"><input type="checkbox" checked={!!p.reject_unknown} onChange={(e) => setP({ reject_unknown: e.target.checked })} /> Also reject when no experience is stated</label>
    </div>
  );
  if (rule.type === "required_keywords") return (
    <div className="space-y-2">
      <label className="block"><span className={LABEL}>Keywords / skills (one per line, case-insensitive patterns)</span><textarea rows={3} value={(p.keywords || []).join("\n")} onChange={(e) => setP({ keywords: toList(e.target.value) })} className={`${INPUT} mt-1`} /></label>
      <select value={p.match} onChange={(e) => setP({ match: e.target.value })} className={INPUT}><option value="any">Candidate must mention at least one</option><option value="all">Candidate must mention all of them</option></select>
      <p className="text-[11px] text-ink/50">Checked against the application text and the CV. If there is nothing readable to check, the applicant is kept for a person to look at.</p>
    </div>
  );
  if (rule.type === "location") return (
    <div className="space-y-2">
      <label className="block"><span className={LABEL}>Allowed cities (one per line)</span><textarea rows={3} value={(p.allowed || []).join("\n")} onChange={(e) => setP({ allowed: toList(e.target.value) })} className={`${INPUT} mt-1`} /></label>
      <label className="flex items-center gap-2 text-xs text-ink/80"><input type="checkbox" checked={p.allow_relocate !== false} onChange={(e) => setP({ allow_relocate: e.target.checked })} /> Keep applicants outside these cities who say they will relocate</label>
    </div>
  );
  if (rule.type === "max_notice_period") return (
    <label className="block"><span className={LABEL}>Maximum notice period (days)</span><input type="number" min="0" max="365" value={p.days ?? 60} onChange={(e) => setP({ days: Number(e.target.value) })} className={`${INPUT} mt-1`} /><span className="text-[11px] text-ink/50">Read from a notice-period answer or from phrases like "60 days notice" in the application or CV. Not stated = kept.</span></label>
  );
  return (
    <div>
      <span className={LABEL}>Mandatory fields</span>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 mt-1.5">
        {Object.entries(FIELD_OPTIONS).map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-xs text-ink/80"><input type="checkbox" checked={(p.fields || []).includes(k)} onChange={(e) => setP({ fields: e.target.checked ? [...(p.fields || []), k] : (p.fields || []).filter((x) => x !== k) })} /> {label}</label>
        ))}
      </div>
      <p className="text-[11px] text-ink/50 mt-1">CVs that arrived by email never went through the application form, so this rule skips them.</p>
    </div>
  );
}

export default function CareersRules() {
  const [data, setData] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [edit, setEdit] = useState(null);
  const [dry, setDry] = useState(null); // { for: ruleId|'draft'|'all', ...result }
  const [busy, setBusy] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const load = () => api.get("/api/careers/screening/rules").then(({ data: d }) => setData(d));
  useEffect(() => { load(); api.get("/api/careers/jobs").then(({ data: j }) => setJobs(j)).catch(() => {}); }, []);
  // The careers service's JSON error comes through as a string in `detail`.
  const fail = (e, d) => {
    const raw = e?.response?.data?.detail;
    let text = d;
    if (typeof raw === "string") { try { text = JSON.parse(raw).error || raw; } catch { text = raw; } }
    setErr(text);
  };

  const preview = async (payload, key) => {
    setBusy("dry"); setErr(""); setDry(null);
    try { const { data: r } = await api.post("/api/careers/screening/rules/dry-run", payload); setDry({ ...r, key }); } catch (e) { fail(e, "Could not run the preview"); } finally { setBusy(""); }
  };
  const save = async (rule) => {
    setBusy("save"); setErr(""); setMsg("");
    try { await api.post("/api/careers/screening/rules", rule); setEdit(null); setDry(null); setMsg("Rule saved."); await load(); } catch (e) { fail(e, "Could not save"); } finally { setBusy(""); }
  };
  const toggle = async (r) => {
    if (!r.enabled) {
      // Always show the effect before switching a rule on.
      setBusy("dry"); setErr("");
      try {
        const { data: res } = await api.post("/api/careers/screening/rules/dry-run", { rule_id: r.id });
        setDry({ ...res, key: r.id, confirmEnable: r });
      } catch (e) { fail(e, "Could not run the preview"); } finally { setBusy(""); }
      return;
    }
    await save({ ...r, enabled: false });
  };
  const remove = async (r) => { if (!confirm(`Delete the rule "${r.name}"? Applicants it already auto-rejected stay where they are and can still be restored.`)) return; await api.delete(`/api/careers/screening/rules/${r.id}`); await load(); };
  const runAll = async () => {
    if (!confirm("Apply all enabled rules to the current screening queue now? Matching New applicants move to Auto-Rejected (kept, never emailed, restorable).")) return;
    setBusy("run"); setErr(""); setMsg("");
    try { const { data: r } = await api.post("/api/careers/screening/rules/run", { apply: true }); setMsg(`${r.rejected} applicant${r.rejected === 1 ? "" : "s"} auto-rejected out of ${r.total} in the queue.`); setDry(null); await load(); } catch (e) { fail(e, "Could not run"); } finally { setBusy(""); }
  };

  const rules = data?.rules || [];
  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-2xl text-ink">Careers — Auto-reject Rules</h2>
        <p className="text-xs text-ink/70 mt-0.5 max-w-3xl">Rules run on every new application, in priority order (lowest number first). A matching applicant moves to <strong>Auto-Rejected</strong>: hidden from the active list, never emailed, and restorable with one click. The rule that fired is stored as the reason. A rule that cannot decide (no readable CV, notice period not mentioned) keeps the applicant for a person to review. For institute / portfolio / couture rules see <Link to="/admin/careers/screening" className="underline">Screening Rules</Link>.</p>
      </div>
      <CareersNav />
      {err && <p className="text-xs text-rust-500 mb-3">{err}</p>}
      {msg && <p className="text-xs text-jade-700 mb-3">{msg}</p>}

      {!edit && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <button type="button" onClick={() => { setEdit({ ...BLANK }); setDry(null); }} className={`${BTN} bg-jade-600 text-white hover:bg-jade-700`}>+ Add rule</button>
          <button type="button" disabled={!!busy || !rules.some((r) => r.enabled)} onClick={() => preview({}, "all")} className={`${BTN} border border-ink/20 text-ink hover:bg-manila/40 disabled:opacity-40`}>Preview all enabled rules</button>
          <button type="button" disabled={!!busy || !rules.some((r) => r.enabled)} onClick={runAll} className={`${BTN} border border-rust-500/40 text-rust-500 hover:bg-rust-50 disabled:opacity-40`}>Apply enabled rules to current applicants</button>
        </div>
      )}

      {edit && (
        <div className="bg-paper rounded-sm shadow-card p-5 mb-5 space-y-4 max-w-3xl">
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block"><span className={LABEL}>Rule name</span><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={`${INPUT} mt-1`} placeholder="e.g. At least 2 years experience" /></label>
            <label className="block"><span className={LABEL}>Type</span>
              <select value={edit.type} disabled={!!edit.id} onChange={(e) => setEdit({ ...edit, type: e.target.value, params: { ...DEFAULT_PARAMS[e.target.value] } })} className={`${INPUT} mt-1`}>
                {Object.entries(TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </label>
            <label className="block"><span className={LABEL}>Applies to</span>
              <select value={edit.job_id || ""} onChange={(e) => setEdit({ ...edit, job_id: e.target.value ? Number(e.target.value) : null })} className={`${INPUT} mt-1`}>
                <option value="">All roles</option>
                {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </label>
            <label className="block"><span className={LABEL}>Priority (lower runs first)</span><input type="number" min="0" max="1000" value={edit.priority} onChange={(e) => setEdit({ ...edit, priority: Number(e.target.value) })} className={`${INPUT} mt-1`} /></label>
          </div>
          <ParamEditor rule={edit} setRule={setEdit} />
          <div className="flex gap-2 flex-wrap items-center">
            <button type="button" disabled={!!busy} onClick={() => preview({ rule: edit }, "draft")} className={`${BTN} border border-ink/20 text-ink hover:bg-manila/40 disabled:opacity-40`}>{busy === "dry" ? "Checking…" : "Preview effect"}</button>
            <button type="button" disabled={!!busy || !edit.name.trim()} onClick={() => save({ ...edit, enabled: edit.enabled })} className={`${BTN} bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40`}>Save {edit.enabled ? "(enabled)" : "(disabled)"}</button>
            <label className="flex items-center gap-2 text-xs text-ink/80"><input type="checkbox" checked={edit.enabled} onChange={(e) => setEdit({ ...edit, enabled: e.target.checked })} /> Enabled</label>
            <button type="button" onClick={() => { setEdit(null); setDry(null); }} className={`${BTN} text-ink/70 hover:text-ink`}>Cancel</button>
          </div>
        </div>
      )}

      {dry && (
        <div className="bg-paper rounded-sm shadow-card p-5 mb-5 max-w-3xl border-l-4 border-ochre-500">
          <p className="text-sm text-ink"><strong>Would reject {dry.would_reject} of {dry.total} current applicants</strong> <span className="text-ink/60">(New, not flagged as duplicates). Nothing has been changed.</span></p>
          {dry.samples?.length > 0 && (
            <ul className="mt-2 max-h-56 overflow-y-auto text-xs space-y-1">
              {dry.samples.map((s) => <li key={s.id} className="text-ink/80"><Link className="underline" to={`/admin/careers/applicants/${s.id}`}>{s.full_name}</Link> <span className="text-ink/55">— {s.reason}</span></li>)}
            </ul>
          )}
          {dry.confirmEnable && (
            <div className="flex gap-2 mt-3">
              <button type="button" disabled={!!busy} onClick={() => save({ ...dry.confirmEnable, enabled: true })} className={`${BTN} bg-jade-600 text-white hover:bg-jade-700`}>Enable "{dry.confirmEnable.name}"</button>
              <button type="button" onClick={() => setDry(null)} className={`${BTN} text-ink/70`}>Keep disabled</button>
            </div>
          )}
        </div>
      )}

      <div className="space-y-2 max-w-3xl">
        {!data ? <p className="text-sm text-ink/60">Loading…</p> : rules.length === 0 ? <p className="text-sm text-ink/60">No rules yet. New rules start disabled so you can preview them first.</p> : rules.map((r) => (
          <div key={r.id} className={`bg-paper rounded-sm shadow-card px-4 py-3 flex items-start justify-between gap-3 ${r.enabled ? "" : "opacity-70"}`}>
            <div>
              <p className="text-sm font-medium text-ink">{r.name} <span className={`text-[11px] font-semibold ${r.enabled ? "text-jade-700" : "text-ink/50"}`}>· {r.enabled ? "Enabled" : "Disabled"}</span></p>
              <p className="text-xs text-ink/65">{TYPE_LABEL[r.type]}: {describe(r)}</p>
              <p className="text-[11px] text-ink/45">Priority {r.priority} · {r.job_id ? (jobs.find((j) => j.id === r.job_id)?.title || `role #${r.job_id}`) : "all roles"} · updated by {r.updated_by || "—"}</p>
            </div>
            <div className="flex gap-3 text-xs whitespace-nowrap">
              <button type="button" disabled={!!busy} onClick={() => toggle(r)} className="text-jade-700 font-semibold hover:underline">{r.enabled ? "Disable" : "Preview & enable"}</button>
              <button type="button" onClick={() => { setEdit({ ...r }); setDry(null); }} className="text-jade-700 hover:underline">Edit</button>
              <button type="button" onClick={() => remove(r)} className="text-rust-500 hover:underline">Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
