import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Circle, Plus, RefreshCw, Send, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../lib/api.js";

// The automated new-joiner pipeline (backend/onboarding_pipeline.py):
// offer signed -> NDA (joiner, then Dev) -> details form -> HR approval ->
// work email -> biometric (Laki) + Slack + analyst doc -> manager notified.
// Most steps advance on their own; this page shows where each joiner is,
// what is stuck, and lets HR set the work email and re-send any step.

const inputCls = "w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";
const btn = "inline-flex items-center gap-1.5 rounded-sm px-3 py-2 text-sm font-semibold disabled:opacity-50";
const btnPrimary = `${btn} bg-jade-600 text-white`;
const btnGhost = `${btn} border border-ink/15 text-ink bg-paper hover:bg-manila/50`;

function stamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function Steps({ steps }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {steps.map((s) => (
        <span key={s.key} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${s.done ? "bg-jade-50 text-jade-700" : "bg-ink/5 text-ink/50"}`}>
          {s.done ? <Check size={11} /> : <Circle size={9} />} {s.label}
        </span>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1">{label}</label>
      {children}
    </div>
  );
}

function NewCase({ employees, onCreated, onCancel }) {
  const [f, setF] = useState({ candidate_name: "", candidate_email: "", designation: "", department: "", date_of_joining: "", location: "", mobile: "", reporting_manager_id: "", offer_signed_offline: true, send_nda: true, test_recipient: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const submit = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/api/onboarding-cases", { ...f, reporting_manager_id: f.reporting_manager_id || null });
      onCreated(data);
    } catch (e) {
      setError(e.response?.data?.detail || "Could not start onboarding");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="bg-paper rounded-sm shadow-card p-5 space-y-4">
      <p className="font-display text-lg text-ink">Start onboarding</p>
      <p className="text-sm text-ink/70">Offers signed through the e-sign link start automatically. Use this for an offer signed on paper.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Joiner's name"><input className={inputCls} value={f.candidate_name} onChange={set("candidate_name")} /></Field>
        <Field label="Joiner's personal email"><input className={inputCls} value={f.candidate_email} onChange={set("candidate_email")} /></Field>
        <Field label="Designation"><input className={inputCls} value={f.designation} onChange={set("designation")} /></Field>
        <Field label="Department"><input className={inputCls} value={f.department} onChange={set("department")} /></Field>
        <Field label="Date of joining"><input type="date" className={inputCls} value={f.date_of_joining} onChange={set("date_of_joining")} /></Field>
        <Field label="Mobile"><input className={inputCls} value={f.mobile} onChange={set("mobile")} /></Field>
        <Field label="Reporting manager">
          <ManagerSelect employees={employees} value={f.reporting_manager_id} onChange={(v) => setF((x) => ({ ...x, reporting_manager_id: v }))} />
        </Field>
        <Field label="Test mode: send every email to (optional)"><input className={inputCls} placeholder="leave blank for a real joiner" value={f.test_recipient} onChange={set("test_recipient")} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={f.offer_signed_offline} onChange={set("offer_signed_offline")} /> Offer letter already signed</label>
      <label className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={f.send_nda} onChange={set("send_nda")} /> Email the NDA to sign now</label>
      {error && <p className="text-sm text-rust-500">{error}</p>}
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy} onClick={submit}><Plus size={15} /> {busy ? "Starting…" : "Start onboarding"}</button>
        <button className={btnGhost} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ManagerSelect({ employees, value, onChange }) {
  return (
    <select className={inputCls} value={value || ""} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not set</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>{`${e.first_name} ${e.last_name || ""}`.trim()} ({e.employee_code}){e.designation ? `, ${e.designation}` : ""}</option>
      ))}
    </select>
  );
}

const SETTING_FIELDS = [
  ["dev_name", "NDA company signatory (Dev)"], ["dev_email", "Dev's email"], ["dev_title", "Signatory title on the NDA"],
  ["biometric_name", "Biometric form goes to"], ["biometric_email", "Biometric form email (Laki)"],
  ["escalation_name", "Escalation contact"], ["escalation_email", "Escalation email (Gaurav)"], ["escalate_after_days", "Flag a step as stuck after (days)"],
  ["slack_invite_link", "Slack workspace invite link"], ["analyst_doc_name", "Analyst document name"], ["analyst_doc_url", "Analyst onboarding document link"],
  ["slack_team_id", "Slack team ID (Enterprise Grid only)"],
];

function SettingsPanel({ onClose }) {
  const [s, setS] = useState(null);
  const [bot, setBot] = useState("");
  const [admin, setAdmin] = useState("");
  const [msg, setMsg] = useState("");
  useEffect(() => { api.get("/api/onboarding-cases/settings").then(({ data }) => setS(data)); }, []);
  if (!s) return null;
  const save = async () => {
    setMsg("");
    try {
      const { data } = await api.put("/api/onboarding-cases/settings", { ...s, slack_bot_token: bot, slack_admin_token: admin });
      setS(data); setBot(""); setAdmin(""); setMsg("Saved");
    } catch (e) {
      setMsg(e.response?.data?.detail || "Could not save");
    }
  };
  return (
    <div className="bg-paper rounded-sm shadow-card p-5 space-y-4">
      <p className="font-display text-lg text-ink">Pipeline settings</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SETTING_FIELDS.map(([k, label]) => (
          <Field key={k} label={label}><input className={inputCls} value={s[k] ?? ""} onChange={(e) => setS((x) => ({ ...x, [k]: e.target.value }))} /></Field>
        ))}
        <Field label={`Slack bot token (for manager messages)${s.slack_bot_token_set ? ": saved" : ": not set"}`}>
          <input className={inputCls} type="password" placeholder={s.slack_bot_token_set ? "leave blank to keep" : "xoxb-…"} value={bot} onChange={(e) => setBot(e.target.value)} />
        </Field>
        <Field label={`Slack admin token (Enterprise Grid invites)${s.slack_admin_token_set ? ": saved" : ": not set"}`}>
          <input className={inputCls} type="password" placeholder="optional" value={admin} onChange={(e) => setAdmin(e.target.value)} />
        </Field>
      </div>
      <div className="flex items-center gap-3">
        <button className={btnPrimary} onClick={save}>Save settings</button>
        <button className={btnGhost} onClick={onClose}>Close</button>
        {msg && <span className="text-sm text-ink/70">{msg}</span>}
      </div>
    </div>
  );
}

function CaseDetail({ id, employees, onBack }) {
  const [c, setC] = useState(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const load = () => api.get(`/api/onboarding-cases/${id}`).then(({ data }) => setC(data));
  useEffect(() => { load(); }, [id]);
  if (!c) return <p className="text-ink/70 text-sm"><span className="t-shimmer" data-text="Loading…">Loading…</span></p>;

  const act = async (key, fn) => {
    setBusy(key);
    setError("");
    try {
      const { data } = await fn();
      setC(data);
    } catch (e) {
      setError(e.response?.data?.detail || "Something went wrong");
    } finally {
      setBusy("");
    }
  };
  const resend = (what) => act(what, () => api.post(`/api/onboarding-cases/${id}/resend/${what}`));
  const update = (body) => act("update", () => api.put(`/api/onboarding-cases/${id}`, body));

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-ink/70 hover:text-ink"><ArrowLeft size={15} /> Back to pipeline</button>
      <div className="bg-paper rounded-sm shadow-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="font-display text-xl text-ink">{c.candidate_name}</p>
            <p className="text-sm text-ink/70">{[c.designation, c.department].filter(Boolean).join(", ") || "Role not set"} · joining {c.date_of_joining || "date not set"} · {c.candidate_email}</p>
            {c.test_recipient && <p className="text-xs text-ochre-700 mt-1">Test mode: every email goes to {c.test_recipient}</p>}
          </div>
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${c.status === "completed" ? "bg-jade-50 text-jade-700" : c.status === "cancelled" ? "bg-ink/10 text-ink/60" : "bg-ochre-50 text-ochre-700"}`}>{c.status}</span>
        </div>
        <Steps steps={c.steps} />
        {c.issues.length > 0 && (
          <div className="rounded-sm bg-rust-50 p-3 text-sm text-rust-600 space-y-1">
            {c.issues.map((i) => <p key={i} className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 flex-shrink-0" /> {i}</p>)}
          </div>
        )}
        {error && <p className="text-sm text-rust-500">{error}</p>}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Work email (set when the joiner arrives)">
            {c.work_email ? (
              <p className="text-sm text-ink py-2">{c.work_email} <span className="text-ink/50">· set {stamp(c.work_email_set_at)}</span></p>
            ) : (
              <div className="flex gap-2">
                <input className={inputCls} placeholder="name@jadecouture.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <button className={btnPrimary} disabled={!email || busy === "email" || !c.form_approved_at} onClick={() => act("email", () => api.post(`/api/onboarding-cases/${id}/work-email`, { email }))}>
                  {busy === "email" ? "Saving…" : "Save"}
                </button>
              </div>
            )}
            {!c.work_email && !c.form_approved_at && <p className="text-xs text-ink/50 mt-1">Approve the details form first (Onboarding Forms), so the employee code exists.</p>}
            {!c.work_email && <p className="text-xs text-ink/50 mt-1">Saving sends the biometric form to Laki, the Slack invite and the welcome email{c.is_analyst ? " with the analyst document" : ""}.</p>}
          </Field>
          <Field label="Reporting manager">
            <ManagerSelect employees={employees} value={c.reporting_manager_id} onChange={(v) => update({ set_manager: true, reporting_manager_id: v || null })} />
            <p className="text-xs text-ink/50 mt-1">Gets the Slack message when onboarding is complete.</p>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={!!c.is_analyst} onChange={(e) => update({ is_analyst: e.target.checked })} /> Analyst role (send the analyst onboarding document)
        </label>

        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} disabled={!!busy || !!c.nda_candidate_signed_at} onClick={() => resend("nda")}><Send size={14} /> Resend NDA</button>
          <button className={btnGhost} disabled={!!busy || !c.nda_candidate_signed_at || !!c.nda_dev_signed_at} onClick={() => act("dev", () => api.post(`/api/onboarding-cases/${id}/resend-dev`))}><Send size={14} /> Remind Dev to sign</button>
          <button className={btnGhost} disabled={!!busy || !c.nda_candidate_signed_at || !!c.form_submitted_at} onClick={() => resend("form")}><Send size={14} /> Resend form link</button>
          <button className={btnGhost} disabled={!!busy || !c.work_email || !!c.biometric_enrolled_at} onClick={() => resend("biometric")}><Send size={14} /> Resend biometric form</button>
          <button className={btnGhost} disabled={!!busy || !c.work_email} onClick={() => resend("welcome")}><Send size={14} /> Resend Slack + welcome</button>
          {c.is_analyst && <button className={btnGhost} disabled={!!busy} onClick={() => resend("analyst_doc")}><Send size={14} /> Send analyst document</button>}
          <button className={btnGhost} disabled={!!busy || !c.completed_at} onClick={() => resend("manager")}><Send size={14} /> Notify manager again</button>
          {c.status !== "cancelled" ? (
            <button className={btnGhost} disabled={!!busy} onClick={() => window.confirm("Cancel this onboarding? No more emails will go out for it.") && update({ status: "cancelled" })}>Cancel onboarding</button>
          ) : (
            <button className={btnGhost} disabled={!!busy} onClick={() => update({ status: "active" })}>Reopen</button>
          )}
        </div>
        {c.biometric_enrolled_at && (
          <p className="text-sm text-ink/70">Biometric: device ID {c.biometric_device_code} ({(c.biometric_methods || []).join(", ")}) by {c.biometric_by}, {stamp(c.biometric_enrolled_at)}</p>
        )}
      </div>

      <div className="bg-paper rounded-sm shadow-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-2">Timeline</p>
        <ul className="space-y-1.5">
          {[...(c.events || [])].reverse().map((e, i) => (
            <li key={i} className="text-sm text-ink flex gap-3"><span className="text-ink/50 font-nums w-28 flex-shrink-0">{stamp(e.at)}</span><span>{e.text}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function OnboardingPipeline() {
  const [cases, setCases] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("");
  const [check, setCheck] = useState(null);
  const [showDone, setShowDone] = useState(false);

  const load = () => api.get("/api/onboarding-cases").then(({ data }) => setCases(data));
  useEffect(() => {
    load();
    api.get("/api/employees", { params: { lite: true } }).then(({ data }) => setEmployees(data.filter((e) => e.is_active !== false))).catch(() => {});
  }, []);

  if (selected) return <CaseDetail id={selected} employees={employees} onBack={() => { setSelected(null); load(); }} />;

  const runCheck = async (dry) => {
    const { data } = await api.post("/api/onboarding-cases/escalate", null, { params: { dry_run: dry } });
    setCheck({ ...data, dry });
  };
  const shown = (cases || []).filter((c) => showDone || c.status === "active");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink">Onboarding pipeline</h2>
          <p className="text-sm text-ink/70 mt-1">Offer, NDA, details form, work email, biometric, Slack and manager sign-off for every new joiner. Stuck steps are emailed to Gaurav daily. <Link to="/admin/onboarding" className="text-jade-600 underline">Review submitted forms</Link></p>
        </div>
        <div className="flex gap-2">
          <button className={btnGhost} onClick={() => runCheck(true)}><RefreshCw size={14} /> Check stuck steps</button>
          <button className={btnGhost} onClick={() => setMode(mode === "settings" ? "" : "settings")}><Settings size={14} /> Settings</button>
          <button className={btnPrimary} onClick={() => setMode(mode === "new" ? "" : "new")}><Plus size={15} /> Start onboarding</button>
        </div>
      </div>

      {mode === "new" && <NewCase employees={employees} onCancel={() => setMode("")} onCreated={(c) => { setMode(""); setSelected(c.id); }} />}
      {mode === "settings" && <SettingsPanel onClose={() => setMode("")} />}
      {check && (
        <div className="bg-paper rounded-sm shadow-card p-4 text-sm space-y-2">
          {check.flagged.length === 0 ? <p className="text-jade-700 flex items-center gap-1.5"><CheckCircle2 size={15} /> Nothing is stuck.</p> : (
            <>
              <p className="text-ink">{check.flagged.length} joiner(s) need attention{check.dry ? "" : check.emailed ? `. Emailed ${check.to}.` : `. Email failed: ${check.error}`}</p>
              {check.flagged.map((f) => <p key={f.name} className="text-ink/70"><strong className="text-ink">{f.name}</strong>: {f.issues.join("; ")}</p>)}
              {check.dry && <button className={btnPrimary} onClick={() => runCheck(false)}><Send size={14} /> Email this to Gaurav now</button>}
            </>
          )}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-ink/70"><input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} /> Show completed and cancelled</label>
      {!cases ? <p className="text-ink/70 text-sm"><span className="t-shimmer" data-text="Loading…">Loading…</span></p> : shown.length === 0 ? (
        <p className="text-sm text-ink/60">No joiners in the pipeline. One appears here as soon as a candidate signs their offer letter.</p>
      ) : (
        <div className="space-y-2">
          {shown.map((c) => (
            <button key={c.id} onClick={() => setSelected(c.id)} className="w-full text-left bg-paper rounded-sm shadow-card p-4 hover:ring-1 hover:ring-jade-500 space-y-2">
              <div className="flex flex-wrap justify-between gap-2">
                <p className="text-ink font-semibold">{c.candidate_name} <span className="font-normal text-ink/60 text-sm">· {c.designation || "role not set"} · joining {c.date_of_joining || "not set"}</span></p>
                {c.issues.length > 0 ? <span className="text-xs text-rust-600 flex items-center gap-1"><AlertTriangle size={13} /> {c.issues.length} issue{c.issues.length > 1 ? "s" : ""}</span>
                  : <span className="text-xs text-ink/50">{c.status}</span>}
              </div>
              <Steps steps={c.steps} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
