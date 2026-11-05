import { useEffect, useMemo, useState } from "react";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

const TABS = [["leave", "Leave requests"], ["absence", "Work absences"], ["disputes", "Attendance disputes"]];
const dateLabel = (v) => v ? new Date(`${v.slice(0, 10)}T12:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const employeeName = (r) => `${r.hr_employees?.first_name || r.employee_name || "Employee"} ${r.hr_employees?.last_name || ""}`.trim();

export default function NimitRequests() {
  const { user } = useAuth();
  const [tab, setTab] = useState("leave");
  const [filter, setFilter] = useState("pending");
  const [query, setQuery] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (user?.employee_code !== "14456") return;
    let cancelled = false;
    api.get("/api/nimit/requests").then(({ data: result }) => { if (!cancelled) setData(result); })
      .catch(() => { if (!cancelled) setError("Could not load requests. Please refresh to try again."); });
    return () => { cancelled = true; };
  }, [user?.employee_code]);
  const rows = useMemo(() => (data?.[tab] || []).filter((row) => {
    if (filter !== "all" && row.status !== filter) return false;
    return [employeeName(row), row.hr_employees?.employee_code, row.hr_employees?.location,
      row.hr_employees?.reporting_manager, row.leave_type, row.issue_type, row.reason]
      .join(" ").toLowerCase().includes(query.trim().toLowerCase());
  }), [data, tab, filter, query]);
  if (user?.employee_code !== "14456") return <p className="text-ink/70">This section is available to Nimit.</p>;
  return <div className="space-y-5">
    <div><p className="text-xs font-semibold uppercase tracking-widest text-jade-600">Company-wide visibility</p>
      <h1 className="font-display text-3xl text-ink mt-1">All Requests</h1>
      <p className="text-sm text-ink/70 mt-1">Leave, work absences, and attendance disputes across every location. Read only.</p></div>
    <div className="flex flex-wrap gap-2" role="tablist" aria-label="Request type">
      {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key}
        onClick={() => { setTab(key); setFilter("pending"); }}
        className={`px-4 py-2 text-sm rounded-sm border ${tab === key ? "bg-ledger-800 text-manila border-ledger-800" : "bg-paper text-ink border-ink/15"}`}>
        {label} {data && <span className="font-nums ml-1">{data[key]?.length || 0}</span>}
      </button>)}</div>
    <div className="flex flex-wrap gap-3 items-center">
      <select aria-label="Status" value={filter} onChange={(e) => setFilter(e.target.value)} className="border border-ink/20 bg-paper px-3 py-2 text-sm rounded-sm">
        <option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="all">All statuses</option></select>
      <input aria-label="Search requests" placeholder="Search employee, code, location, reason…" value={query}
        onChange={(e) => setQuery(e.target.value)} className="min-w-[240px] flex-1 border border-ink/20 bg-paper px-3 py-2 text-sm rounded-sm" /></div>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {!data && !error && <p className="text-ink/70">Loading requests…</p>}
    {data && <div className="space-y-3"><p className="text-xs text-ink/60 font-nums">{rows.length} shown</p>
      {rows.length === 0 && <p className="bg-paper border border-ink/10 p-6 text-sm text-ink/70">No matching requests.</p>}
      {rows.map((row) => <article key={row.id} className="bg-paper border border-ink/10 p-4 md:p-5 rounded-sm">
        <div className="flex flex-wrap justify-between gap-2"><div>
          <h2 className="font-semibold text-ink">{employeeName(row)} <span className="font-nums text-ink/60 text-sm">{row.hr_employees?.employee_code || ""}</span></h2>
          <p className="text-xs text-ink/60 mt-0.5">{row.hr_employees?.location || ""}{row.hr_employees?.reporting_manager ? ` · Reports to ${row.hr_employees.reporting_manager}` : ""}</p></div>
          <span className="text-xs uppercase tracking-wide text-jade-700 font-semibold">{row.status || "Unknown"}</span></div>
        <p className="text-sm text-ink mt-3">{tab === "leave" ? row.leave_type?.replaceAll("_", " ") : tab === "disputes" ? row.issue_type?.replaceAll("_", " ") : "Work absence"}
          {" · "}{dateLabel(row.start_date || row.date)}{row.end_date && row.end_date !== row.start_date ? ` – ${dateLabel(row.end_date)}` : ""}</p>
        {row.reason && <p className="text-sm text-ink/80 mt-2 whitespace-pre-wrap">{row.reason}</p>}
        {row.admin_note && <p className="text-xs text-ink/65 mt-2">Note: {row.admin_note}</p>}
        <p className="text-xs text-ink/50 mt-3">Requested {dateLabel(row.created_at)}</p>
      </article>)}</div>}
  </div>;
}
