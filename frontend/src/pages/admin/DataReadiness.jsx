import EmptyState from "../../components/EmptyState.jsx";
import { AlertTriangle, CheckCircle2, ChevronDown, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

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
      <p className="text-[11px] font-semibold text-ink/60">{label}</p>
      <p className={`font-display text-2xl mt-1 ${tone || "text-ink"}`}>{value}</p>
    </div>
  );
}

// Dropdown listing everyone a check flagged: name + employee code, each
// linking to the record so HR can fill the missing detail in.
function PeopleDropdown({ people, label }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return people;
    return people.filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(t));
  }, [people, q]);
  if (!people?.length) return null;
  return (
    <div className="mt-1.5">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="inline-flex items-center gap-1 text-xs font-semibold text-jade-700 hover:underline">
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        {open ? "Hide" : "View"} {label || `${people.length} employee${people.length === 1 ? "" : "s"}`}
      </button>
      {open && (
        <div className="mt-2 border border-ink/10 rounded-sm bg-ink/[0.02]">
          {people.length > 8 && (
            <input type="search" aria-label="Search employees by name or code" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or code"
              className="w-full border-b border-ink/10 bg-paper px-2 py-1.5 text-xs text-ink focus:outline-none" />
          )}
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-paper">
                <tr className="text-left text-[10px] text-ink/60">
                  <th className="px-2 py-1.5 w-24">Emp code</th><th className="px-2 py-1.5">Employee name</th>
                  {people[0]?.missing && <th className="px-2 py-1.5">Not updated</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.id || p.code} className="border-t border-ink/10 align-top">
                    <td className="px-2 py-1.5 font-mono text-ink/80">{p.code || "—"}</td>
                    <td className="px-2 py-1.5">
                      {p.id ? <Link to={`/admin/employees/${p.id}`} className="text-ink hover:text-jade-700 hover:underline">{p.name || "(no name)"}</Link> : (p.name || "(no name)")}
                    </td>
                    {p.missing && <td className="px-2 py-1.5 text-ink/70">{p.missing.join(", ")}</td>}
                  </tr>
                ))}
                {!shown.length && <tr><td colSpan={3}><EmptyState title="No match" action={{ label: "Clear search", onClick: () => setQ("") }}>No employee fits that name or code.</EmptyState></td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Short labels for the "what's missing" column of the combined list.
const MISSING_LABEL = {
  blank_time_slot: "Time Slot",
  unknown_time_slot: "Time Slot (unrecognised)",
  no_leave_approver: "Reporting manager",
  no_email: "Email",
  no_joining_date: "Date of joining",
  no_dob: "Date of birth",
  no_pan: "PAN",
  no_aadhar: "Aadhar",
  no_bank: "Bank account / IFSC",
  no_salary_figures: "Salary figures",
};

// One row per employee across every completeness check, with what is missing.
function NotUpdatedPanel({ checks }) {
  const people = useMemo(() => {
    const byId = new Map();
    for (const c of checks) {
      if (!MISSING_LABEL[c.key]) continue;
      for (const p of c.people || []) {
        const k = p.id || p.code;
        if (!byId.has(k)) byId.set(k, { ...p, missing: [] });
        byId.get(k).missing.push(MISSING_LABEL[c.key]);
      }
    }
    return [...byId.values()].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [checks]);
  return (
    <section className="mb-8">
      <h3 className="font-display text-lg text-ink mb-2">Employees whose details are not updated</h3>
      <div className="bg-paper rounded-sm shadow-card p-4">
        {people.length ? (
          <>
            <p className="text-sm text-ink">
              <span className="font-semibold text-ochre-700">{people.length}</span> active employee{people.length === 1 ? " has" : "s have"} at least one detail missing.
            </p>
            <PeopleDropdown people={people} label={`all ${people.length} with what is missing`} />
          </>
        ) : (
          <p className="text-sm text-jade-700">Every active employee’s details are complete.</p>
        )}
      </div>
    </section>
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
          {bad && <PeopleDropdown people={c.people} />}
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
        <select aria-label="Filter by workflow" value={workflow} onChange={(e) => setWorkflow(e.target.value)} className="rounded-sm border border-ink/15 bg-paper px-2 py-1 text-sm text-ink">
          <option value="">All workflows</option>
          {Object.entries(log?.workflows || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <p className="text-xs text-ink/60 mb-2">Who approved, rejected or completed each step, and what it was based on. Steps taken before this log began are not shown.</p>
      <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-ink/60">
              <th className="p-3">When</th><th className="p-3">Workflow</th><th className="p-3">Step</th><th className="p-3">Employee</th><th className="p-3">By</th><th className="p-3">Based on</th>
            </tr>
          </thead>
          <tbody>
            {!log && <tr><td className="p-3 text-ink/60" colSpan={6}>Loading...</td></tr>}
            {log && log.events.length === 0 && <tr><td colSpan={6}><EmptyState title="No workflow steps recorded yet" action={workflow ? { label: "Show all workflows", onClick: () => setWorkflow("") } : { label: "Open disputes", to: "/admin/disputes" }}>Approvals and rejections show up here once someone acts on a request.</EmptyState></td></tr>}
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

// Accounts that look unused (never named, stub records, repeatedly missing from the roster, or no
// punches / pay / login) can be deactivated in bulk. The server re-checks every id before it acts,
// and a deactivated person can be reactivated from their own record.
const PRESELECT = new Set(["placeholder", "stub"]);

function InactiveAccounts() {
  const { can } = useAuth() || {};
  const [state, setState] = useState(null);
  const [error, setError] = useState("");
  const [picked, setPicked] = useState(new Set());
  const [reason, setReason] = useState("all");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);
  const canDeactivate = !can || can("employees.manage");

  const load = () => {
    setError("");
    api.get("/api/data-readiness/inactive-accounts")
      .then(({ data }) => {
        setState(data);
        setPicked(new Set(data.candidates.filter((c) => PRESELECT.has(c.reason)).map((c) => c.id)));
      })
      .catch((err) => setError(err.response?.data?.detail || "Could not load inactive accounts"));
  };
  useEffect(load, []);

  const shown = useMemo(() => (state ? state.candidates.filter((c) => reason === "all" || c.reason === reason) : []), [state, reason]);
  const toggle = (id) => setPicked((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allShownPicked = shown.length > 0 && shown.every((c) => picked.has(c.id));
  const toggleShown = () => setPicked((p) => { const n = new Set(p); shown.forEach((c) => (allShownPicked ? n.delete(c.id) : n.add(c.id))); return n; });

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/api/data-readiness/inactive-accounts/deactivate", { employee_ids: [...picked] });
      setDone(data);
      setConfirming(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not deactivate");
    } finally {
      setBusy(false);
    }
  };

  if (error && !state) return <p className="text-sm text-rust-600 mb-8">{error}</p>;
  if (!state) return <p className="text-sm text-ink/60 mb-8">Looking for inactive accounts…</p>;

  return (
    <section className="mb-8">
      <h3 className="font-display text-lg text-ink mb-1">Inactive accounts</h3>
      <p className="text-sm text-ink/70 mb-3 max-w-3xl">
        Accounts with no pay on file that look unused. Anyone with a salary, a punch in the last {state.idle_days} days, an HR/Accounts login, a recent joining
        date, or who is someone's reporting manager is never listed. Deactivating keeps all history; each person can be reactivated from their record.
      </p>
      {done && (
        <p className="text-sm text-jade-700 border-l-2 border-jade-500 pl-2.5 mb-3">
          Deactivated {done.deactivated} account{done.deactivated === 1 ? "" : "s"}{done.skipped ? ` (${done.skipped} skipped because they are no longer eligible)` : ""}.
        </p>
      )}
      {error && <p className="text-sm text-rust-600 mb-3">{error}</p>}
      {state.candidates.length === 0 ? (
        <p className="text-sm text-ink/60">No inactive accounts found.</p>
      ) : (
        <div className="bg-paper rounded-sm shadow-card">
          <div className="flex flex-wrap items-center gap-3 p-3 border-b border-ink/10">
            <select aria-label="Filter by reason" value={reason} onChange={(e) => setReason(e.target.value)}
              className="rounded-sm border border-ink/15 bg-paper px-3 py-1.5 text-xs text-ink">
              <option value="all">All reasons ({state.candidates.length})</option>
              {Object.entries(state.reasons).filter(([k]) => state.counts[k]).map(([k, label]) => (
                <option key={k} value={k}>{label} ({state.counts[k]})</option>
              ))}
            </select>
            <span className="text-xs text-ink/60">{picked.size} selected</span>
            {canDeactivate && !confirming && (
              <button type="button" disabled={!picked.size} onClick={() => setConfirming(true)}
                className="ml-auto bg-rust-600 text-white px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-rust-500 disabled:opacity-40 transition-colors">
                Deactivate {picked.size || ""} selected
              </button>
            )}
            {canDeactivate && confirming && (
              <span className="ml-auto flex items-center gap-3 text-xs">
                <span className="text-rust-600 font-semibold">Deactivate {picked.size} account{picked.size === 1 ? "" : "s"}?</span>
                <button type="button" disabled={busy} onClick={run}
                  className="bg-rust-600 text-white px-[1.5em] py-[0.625em] leading-tight rounded-sm font-semibold hover:bg-rust-500 disabled:opacity-50">{busy ? "Working…" : "Yes, deactivate"}</button>
                <button type="button" onClick={() => setConfirming(false)} className="text-ink/70 hover:text-ink">Cancel</button>
              </span>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-paper">
                <tr className="text-left text-[10px] text-ink/60">
                  <th className="px-3 py-2 w-8"><input type="checkbox" aria-label="Select all shown" checked={allShownPicked} onChange={toggleShown} /></th>
                  <th className="px-3 py-2 w-24">Emp code</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Why it is listed</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} className="border-t border-ink/10">
                    <td className="px-3 py-1.5"><input type="checkbox" aria-label={`Select ${c.name || c.code}`} checked={picked.has(c.id)} onChange={() => toggle(c.id)} /></td>
                    <td className="px-3 py-1.5 font-mono text-ink/80">{c.code}</td>
                    <td className="px-3 py-1.5"><Link to={`/admin/employees/${c.id}`} className="text-ink hover:text-jade-700 hover:underline">{c.name || "(no name)"}</Link></td>
                    <td className="px-3 py-1.5 text-ink/70">{c.location || "—"}</td>
                    <td className="px-3 py-1.5 text-ink/70">{c.reason_label}{c.reason === "not_in_roster" ? ` (${c.roster_missed} syncs)` : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
        <h2 className="font-display text-2xl text-ink">Data readiness</h2>
        <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-1.5 text-sm text-jade-700 disabled:opacity-50">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Re-check
        </button>
      </div>
      <p className="text-sm text-ink/70 mb-6">
        Whether the data behind attendance, payroll and letters can be trusted. It reports problems and never creates anyone; the only change it can make is deactivating inactive accounts you select.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-paper rounded-sm shadow-card p-4">
          <p className="text-[11px] font-semibold text-ink/60">Overall</p>
          <span className={`inline-block mt-2 px-2 py-1 rounded-sm text-sm font-semibold ${verdict.cls}`}>{verdict.label}</span>
        </div>
        <Stat label="Active employees" value={data.active_employees} />
        <Stat label="Checks needing attention" value={flagged} tone={flagged ? "text-ochre-700" : "text-jade-700"} />
        <Stat label="On imported register" value={`${data.register.on_register} / ${data.active_employees}`} />
      </div>

      <InactiveAccounts />

      <h3 className="font-display text-lg text-ink mb-3">Data feeds and who owns them</h3>
      <div className="bg-paper rounded-sm shadow-card overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-ink/60">
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

      <NotUpdatedPanel checks={data.checks} />

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
        <div className="bg-paper rounded-sm shadow-card p-5 text-sm space-y-4">
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
