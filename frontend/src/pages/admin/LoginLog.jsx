import { Download, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import api from "../../lib/api.js";

// Login log (Policy Sign-off page): every individual sign-in, newest first.
// Backed by GET /api/policy/login-log (hr_login_events).

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const when = (s) => new Date(s).toLocaleString("en-IN", {
  weekday: "short", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Kolkata",
});

export default function LoginLog() {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 6 * 86400000);
  const [from, setFrom] = useState(iso(weekAgo));
  const [to, setTo] = useState(iso(today));
  const [q, setQ] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/api/policy/login-log", { params: { from, to } })
      .then(({ data }) => { setData(data); setError(""); })
      .catch((e) => setError(e.response?.data?.detail || "Could not load the login log"))
      .finally(() => setLoading(false));
  }, [from, to]);
  useEffect(load, [load]);

  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    const all = data?.logins || [];
    return t ? all.filter((r) => `${r.name} ${r.employee_code} ${r.department || ""} ${r.device}`.toLowerCase().includes(t)) : all;
  }, [data, q]);

  const exportCsv = () => {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["When (IST)", "Employee", "Code", "Department", "Location", "Device"].map(esc).join(",")]
      .concat(rows.map((r) => [when(r.at), r.name, r.employee_code, r.department, r.location, r.device].map(esc).join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `login-log-${from}-to-${to}.csv`;
    a.click();
  };

  const uniquePeople = new Set(rows.map((r) => r.employee_id)).size;

  return (
    <div>
      <p className="text-sm text-ink/70 mb-4">Every time someone signs in to JADE HR, newest first. Times are in IST. Recording started on {data?.tracking_started || "1 Oct 2026"}, so nothing earlier exists.</p>
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <label className="text-xs font-semibold uppercase tracking-wider text-ink/70">From
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="block mt-1 rounded-sm border border-ink/15 bg-paper px-2 py-2 text-sm font-normal normal-case text-ink min-h-[40px]" />
        </label>
        <label className="text-xs font-semibold uppercase tracking-wider text-ink/70">To
          <input type="date" value={to} min={from} max={iso(today)} onChange={(e) => e.target.value && setTo(e.target.value)} className="block mt-1 rounded-sm border border-ink/15 bg-paper px-2 py-2 text-sm font-normal normal-case text-ink min-h-[40px]" />
        </label>
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code, device…" className="w-full rounded-sm border border-ink/15 bg-paper pl-9 pr-3 py-2 text-sm min-h-[40px] focus:outline-none focus:ring-2 focus:ring-jade-500" />
        </div>
        <button type="button" onClick={load} disabled={loading} title="Refresh" className="p-2.5 rounded-sm border border-ink/15 bg-paper text-ink/70 hover:text-ink disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></button>
        <button type="button" onClick={exportCsv} disabled={!rows.length} className="flex items-center gap-1.5 bg-paper border border-ink/15 text-ink/80 px-3 py-2.5 rounded-sm text-xs font-medium hover:border-ink/30 disabled:opacity-50"><Download size={13} /> Export CSV</button>
        <span className="text-xs text-ink/70 font-nums ml-auto">{rows.length} logins · {uniquePeople} people</span>
      </div>
      {error && <p className="text-sm text-rust-500 mb-3">{error}</p>}
      <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink/70 border-b border-ink/10">
              <th className="px-5 py-3">When (IST)</th>
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Department</th>
              <th className="px-5 py-3">Device</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data ? (
              <tr><td className="px-5 py-12 text-center text-ink/60" colSpan={4}><span className="t-shimmer" data-text="Loading…">Loading…</span></td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-5 py-12 text-center text-ink/60" colSpan={4}>No logins in this range.</td></tr>
            ) : rows.map((r) => (
              <tr key={r.id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50">
                <td className="px-5 py-3 font-nums text-ink whitespace-nowrap">{when(r.at)}</td>
                <td className="px-5 py-3"><span className="text-ink font-medium">{r.name}</span><div className="text-xs text-ink/70 font-nums">{r.employee_code}</div></td>
                <td className="px-5 py-3 text-ink/70">{r.department || "—"}</td>
                <td className="px-5 py-3 text-ink/70">{r.device || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
