import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../../lib/api.js";

// Read-only report from backend/routers/data_readiness.py: is the data
// payroll and attendance read fit to trust, who owns each feed, and what the
// late/LOP terms mean for the policy version in force.

const DECISION = {
  ready: { label: "Ready", cls: "bg-jade-50 text-jade-700" },
  ready_with_controls: { label: "Ready with controls", cls: "bg-ochre-50 text-ochre-700" },
  not_ready: { label: "Not ready", cls: "bg-rust-50 text-rust-600" },
};
const SEV = { ok: "text-jade-700", warn: "text-ochre-700", block: "text-rust-600" };
const DIMENSIONS = {
  quality: "Quality and completeness",
  freshness: "Freshness",
  source_of_truth: "Source of truth",
  permissions: "Permissions and sensitivity",
};

function Stat({ label, value, tone }) {
  return (
    <div className="bg-paper rounded-sm shadow-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/60">{label}</p>
      <p className={`font-display text-2xl mt-1 ${tone || "text-ink"}`}>{value}</p>
    </div>
  );
}

function CheckRow({ c }) {
  const bad = c.severity !== "ok";
  return (
    <li className="py-3 border-t border-ink/10 first:border-t-0">
      <div className="flex items-start gap-2">
        {bad ? <AlertTriangle size={16} className={`mt-0.5 flex-shrink-0 ${SEV[c.severity]}`} /> : <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0 text-jade-700" />}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink">
            {c.title} <span className={`font-semibold ${SEV[c.severity]}`}>{c.count} of {c.total}</span>
          </p>
          {bad && c.why && <p className="text-xs text-ink/60 mt-0.5">{c.why}</p>}
          {bad && c.control && <p className="text-xs text-ink/80 mt-0.5"><span className="font-semibold">Control:</span> {c.control}</p>}
          {c.sample.length > 0 && (
            <p className="text-xs text-ink/60 mt-1">
              {c.key === "hr_default_permissions" ? "" : "e.g. "}
              {c.sample.join(", ")}{c.count > c.sample.length && c.key !== "hr_default_permissions" ? ` and ${c.count - c.sample.length} more` : ""}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function WorkflowLog() {
  const [log, setLog] = useState(null);
  const [workflow, setWorkflow] = useState("");

  useEffect(() => {
    api.get("/api/data-readiness/workflow-log", { params: workflow ? { workflow } : {} })
      .then(({ data }) => setLog(data))
      .catch(() => setLog({ workflows: {}, events: [] }));
  }, [workflow]);

  return (
    <section className="mb-8">
      <div className="flex items-center justify-between gap-4 mb-2">
        <h3 className="font-display text-lg text-ink">Recent workflow steps</h3>
        <select value={workflow} onChange={(e) => setWorkflow(e.target.value)} className="rounded-sm border border-ink/15 bg-paper px-2 py-1 text-sm text-ink">
          <option value="">All workflows</option>
          {Object.entries(log?.workflows || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <p className="text-xs text-ink/60 mb-2">Who approved, rejected or completed each step, and what it was based on. Steps taken before this log began are not shown.</p>
      <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink/60">
              <th className="p-3">When</th><th className="p-3">Workflow</th><th className="p-3">Step</th><th className="p-3">Employee</th><th className="p-3">By</th><th className="p-3">Based on</th>
            </tr>
          </thead>
          <tbody>
            {!log && <tr><td className="p-3 text-ink/60" colSpan={6}>Loading...</td></tr>}
            {log && log.events.length === 0 && <tr><td className="p-3 text-ink/60" colSpan={6}>Nothing recorded yet.</td></tr>}
            {log?.events.map((e) => (
              <tr key={e.id} className="border-t border-ink/10 align-top">
                <td className="p-3 whitespace-nowrap">{new Date(e.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</td>
                <td className="p-3">{e.workflow_label}</td>
                <td className="p-3">{e.action.replaceAll("_", " ")}</td>
                <td className="p-3">{e.employee_name || "—"}</td>
                <td className="p-3">{e.actor_name || e.actor_role} <span className="text-ink/50">({e.actor_role})</span></td>
                <td className="p-3 text-xs text-ink/70">
                  {Object.entries(e.basis || {}).map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`).join(", ")}
                  {e.note && <span className="block text-ink/60">“{e.note}”</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function DataReadiness() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = () => {
    setLoading(true);
    setError("");
    api.get("/api/data-readiness")
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.detail || "Could not load the report"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  if (error) return <p className="text-sm text-rust-600">{error}</p>;
  if (!data) return <p className="text-sm text-ink/60">Checking the data...</p>;

  const verdict = DECISION[data.decision];
  const flagged = data.checks.filter((c) => c.severity !== "ok").length;
  const v3 = data.definitions.policies.find((p) => p.status === "in force");

  return (
    <div>
      <div className="flex items-start justify-between gap-4 mb-1">
        <h2 className="font-display text-2xl text-ink">Data Readiness</h2>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 text-sm text-jade-700 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Re-check
        </button>
      </div>
      <p className="text-sm text-ink/70 mb-6">
        Whether the data behind attendance, payroll and letters can be trusted. Read-only: it reports problems and never edits or creates anyone.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-paper rounded-sm shadow-card p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/60">Overall</p>
          <span className={`inline-block mt-2 px-2 py-1 rounded-sm text-sm font-semibold ${verdict.cls}`}>{verdict.label}</span>
        </div>
        <Stat label="Active employees" value={data.active_employees} />
        <Stat label="Checks needing attention" value={flagged} tone={flagged ? "text-ochre-700" : "text-jade-700"} />
        <Stat label="On imported register" value={`${data.register.on_register} / ${data.active_employees}`} />
      </div>

      <h3 className="font-display text-lg text-ink mb-3">Data feeds and who owns them</h3>
      <div className="bg-paper rounded-sm shadow-card overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-ink/60">
              <th className="p-3">Feed</th><th className="p-3">Owner</th><th className="p-3">Expected</th><th className="p-3">Last update</th><th className="p-3">Status</th><th className="p-3">Feeds</th>
            </tr>
          </thead>
          <tbody>
            {data.feeds.map((f) => (
              <tr key={f.feed} className="border-t border-ink/10">
                <td className="p-3 text-ink">{f.feed}</td>
                <td className="p-3">{f.owner}</td>
                <td className="p-3">every {f.expected_every_hours}h</td>
                <td className="p-3">{f.age_hours == null ? "never" : `${f.age_hours}h ago`}</td>
                <td className={`p-3 font-semibold ${SEV[f.severity]}`}>{f.status.replace("_", " ")}</td>
                <td className="p-3 text-ink/70">{f.feeds}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {Object.entries(DIMENSIONS).map(([dim, title]) => {
        const rows = data.checks.filter((c) => c.dimension === dim);
        if (!rows.length) return null;
        return (
          <section key={dim} className="mb-8">
            <h3 className="font-display text-lg text-ink mb-2">{title}</h3>
            <ul className="bg-paper rounded-sm shadow-card px-4">{rows.map((c) => <CheckRow key={c.key} c={c} />)}</ul>
          </section>
        );
      })}

      <section className="mb-8">
        <h3 className="font-display text-lg text-ink mb-2">What the terms mean, and which rule wins</h3>
        <div className="bg-paper rounded-sm shadow-card p-5 text-sm space-y-3">
          {v3 && (
            <p>
              <span className="font-semibold">In force:</span> {v3.version}, from {v3.effective_from}. Daily tolerance {v3.daily_tolerance_minutes} min,
              extended buffer to {v3.extended_buffer_minutes} min ({v3.free_buffer_arrivals_per_cycle} free per cycle), {v3.yellow_cards_for_red} Yellow Cards in a cycle make a Red Card.
            </p>
          )}
          <dl className="space-y-1.5">
            {Object.entries(data.definitions.terms).map(([k, v]) => (
              <div key={k}><dt className="inline font-semibold">{k}: </dt><dd className="inline text-ink/80">{v}</dd></div>
            ))}
          </dl>
          {data.definitions.leave && (
            <p>
              <span className="font-semibold">Leave and Comp-Off:</span> {data.definitions.leave.paid_leave_annual_days} paid-leave days a year
              (not available for the first {data.definitions.leave.paid_leave_probation_days} days), carry-forward up to {data.definitions.leave.carry_forward_cap_hq_days} days at HQ and {data.definitions.leave.carry_forward_cap_retail_days} at retail;
              Comp-Off lasts {data.definitions.leave.comp_off_validity_days} days, at most {data.definitions.leave.comp_off_max_days_per_request} days per request.
              Requests for {data.definitions.leave.blocked_during_red_card.map((t) => t.replace("_", "-")).join(" and ")} are blocked in a Red Card month.
            </p>
          )}
          <div>
            <p className="font-semibold mb-1">When sources disagree</p>
            <ol className="list-decimal pl-5 space-y-1 text-ink/80">
              {data.definitions.conflict_rules.map((r) => <li key={r}>{r}</li>)}
            </ol>
          </div>
        </div>
      </section>

      <WorkflowLog />
    </div>
  );
}
