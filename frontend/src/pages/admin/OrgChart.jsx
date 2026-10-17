import { Network, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import { useCallback, useEffect, useMemo, useState } from "react";

import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const STATUSES = ["On Probation", "Confirmed", "Resigned", "Absconded", "Terminated"];
const STATUS_CLS = {
  "On Probation": "bg-ochre-500/15 text-ochre-700",
  Confirmed: "bg-jade-500/15 text-jade-700",
  Resigned: "bg-ink/10 text-ink/70",
  Absconded: "bg-rust-500/15 text-rust-500",
  Terminated: "bg-rust-500/15 text-rust-500",
};

const selectCls =
  "rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

function StatusBadge({ status }) {
  return <span className={`inline-block rounded-sm px-2 py-0.5 text-xs font-medium ${STATUS_CLS[status] || ""}`}>{status}</span>;
}

function buildTree(rows) {
  const ids = new Set(rows.map((r) => r.employee_id));
  const kids = {};
  const roots = [];
  for (const r of rows) {
    if (r.reporting_manager_id && ids.has(r.reporting_manager_id) && r.reporting_manager_id !== r.employee_id) {
      (kids[r.reporting_manager_id] ||= []).push(r);
    } else roots.push(r);
  }
  return { roots, kids };
}

function Node({ row, kids, depth, seen }) {
  const children = (kids[row.employee_id] || []).filter((c) => !seen.has(c.employee_id));
  const next = new Set(seen).add(row.employee_id); // guards against manager loops
  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
        <span className="text-sm font-medium text-ink">{row.name}</span>
        <span className="text-xs text-ink/60">{row.designation || "—"}</span>
        <StatusBadge status={row.status} />
        {depth === 0 && row.reporting_manager && <span className="text-xs text-ink/50">reports to {row.reporting_manager}</span>}
        {children.length > 0 && <span className="text-xs text-ink/40">{children.length} direct</span>}
      </div>
      {children.length > 0 && (
        <ul className="ml-4 border-l border-ink/15 pl-4">
          {children.map((c) => <Node key={c.employee_id} row={c} kids={kids} depth={depth + 1} seen={next} />)}
        </ul>
      )}
    </li>
  );
}

export default function OrgChart() {
  const [data, setData] = useState(null);
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState("chart");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/org-chart", { params: location ? { location } : {} });
      setData(data);
    } finally {
      setLoading(false);
    }
  }, [location]);

  useEffect(() => { load(); }, [load]);

  const rows = useMemo(() => (data?.employees || []).filter((r) => !status || r.status === status), [data, status]);
  const { roots, kids } = useMemo(() => buildTree(rows), [rows]);
  // Roots with reports are real tops of the org; childless roots with no manager on record are listed separately.
  const tops = roots.filter((r) => (kids[r.employee_id] || []).length || r.reporting_manager);
  const unassigned = roots.filter((r) => !tops.includes(r));

  const downloadGaps = () => {
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const gaps = rows.filter((r) => !r.reporting_manager || !r.designation || r.name_pending);
    const csv = ["Employee Code,Name,Location,Department,Designation,Reporting Manager,Missing"]
      .concat(gaps.map((r) => [r.employee_code, r.name, r.location, r.department, r.designation, r.reporting_manager,
        [!r.reporting_manager && "manager", !r.designation && "designation", r.name_pending && "name"].filter(Boolean).join(" + ")].map(q).join(",")))
      .join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "org-chart-missing-data.csv";
    a.click();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl text-ink flex items-center gap-2"><Network size={22} /> Organisation Chart</h2>
          <p className="text-sm text-ink/60">
            Live from employee records{data ? ` · as of ${formatDate(data.as_of)} · ${data.headcount} active` : ""}. People drop off after their last working day but stay in the database.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={location} onChange={(e) => setLocation(e.target.value)} className={selectCls}>
            <option value="">All locations</option>
            {(data?.locations || []).map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s} ({data?.status_counts?.[s] || 0})</option>)}
          </select>
          <div className="flex rounded-sm border border-ink/15 overflow-hidden text-sm">
            {["chart", "list"].map((v) => (
              <button key={v} onClick={() => setView(v)} className={`px-3 py-2 capitalize ${view === v ? "bg-jade-500 text-white" : "bg-manila/40 text-ink"}`}>{v}</button>
            ))}
          </div>
          <button onClick={load} className={`${selectCls} flex items-center gap-1`} title="Refresh"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
        </div>
      </div>

      {data && (data.status_counts?.["On Probation"] || 0) > 0.5 * data.headcount && (
        <div className="rounded-sm border border-ochre-500/40 bg-ochre-500/10 px-4 py-3 text-sm text-ink">
          Most people show as <b>On Probation</b> because their confirmation date hasn't been entered yet. HR team: please add confirmation dates under{" "}
          <Link to="/admin/confirmations" className="underline">Confirmations</Link> or on each employee's Employment tab. A task has been added to HR Tasks.
        </div>
      )}

      {data && (data.data_gaps.no_reporting_manager > 0 || data.data_gaps.no_designation > 0) && (
        <p className="text-xs text-ink/60">
          <button onClick={downloadGaps} className="underline mr-2">Download missing-data list</button>
          Gaps in this view: {data.data_gaps.name_pending} still named by biometric code only, {data.data_gaps.no_reporting_manager} without a reporting manager, {data.data_gaps.manager_not_linked} with a manager name that isn't linked to an employee record, {data.data_gaps.no_designation} without a designation.
        </p>
      )}

      <div className="bg-paper rounded-sm shadow-card p-5 overflow-x-auto">
        {view === "chart" ? (
          rows.length ? (
            <>
              <ul className="space-y-1">{tops.map((r) => <Node key={r.employee_id} row={r} kids={kids} depth={0} seen={new Set()} />)}</ul>
              {unassigned.length > 0 && (
                <details className="mt-4 border-t border-ink/10 pt-3">
                  <summary className="cursor-pointer text-sm font-medium text-ink">No reporting manager on record ({unassigned.length})</summary>
                  <ul className="mt-2 space-y-0.5">{unassigned.map((r) => <Node key={r.employee_id} row={r} kids={kids} depth={0} seen={new Set()} />)}</ul>
                </details>
              )}
            </>
          ) : <p className="text-sm text-ink/60">{loading ? "Loading…" : "No employees match."}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink/50 border-b border-ink/10">
                <th className="py-2 pr-4">Employee</th><th className="pr-4">Designation</th><th className="pr-4">Reporting manager</th>
                <th className="pr-4">Location</th><th className="pr-4">Status</th><th className="pr-4">Resigned on</th><th>Last working day</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="py-2 pr-4 font-medium text-ink">{r.name}</td>
                  <td className="pr-4 text-ink/70">{r.designation || "—"}</td>
                  <td className="pr-4 text-ink/70">{r.reporting_manager || "—"}</td>
                  <td className="pr-4 text-ink/70">{r.location}</td>
                  <td className="pr-4"><StatusBadge status={r.status} /></td>
                  <td className="pr-4 text-ink/70">{r.resignation_date ? formatDate(r.resignation_date) : "—"}</td>
                  <td className="text-ink/70">{r.leaving_date ? formatDate(r.leaving_date) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
