import { Activity, Download, MonitorSmartphone, RefreshCw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import api from "../../lib/api.js";

// Team Pulse (Policy Sign-off page): who has been signing in to JADE HR,
// and how recently. Backed by GET /api/policy/team-pulse (sql/071).

const BUCKETS = [
  { key: "all", label: "Everyone" },
  { key: "today", label: "Active today", dot: "bg-jade-500" },
  { key: "week", label: "This week", dot: "bg-jade-400/60" },
  { key: "quiet", label: "Quiet 7+ days", dot: "bg-ochre-500" },
  { key: "never", label: "No login recorded", dot: "bg-ink/25" },
];

const REFRESH_MS = 60000;

function relative(iso) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 90) return "just now";
  if (diff < 3600) return `${Math.round(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} h ago`;
  const days = Math.round(diff / 86400);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}

function exact(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata",
  });
}

function windowDays(start, n) {
  const out = [];
  const d = new Date(`${start}T00:00:00`);
  for (let i = 0; i < n; i++) {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`);
  }
  return out;
}

function PulseStrip({ days, active }) {
  const set = new Set(active);
  return (
    <div className="flex gap-[3px]" aria-label={`${active.length} active day${active.length === 1 ? "" : "s"} in the last ${days.length}`}>
      {days.map((d) => (
        <span
          key={d}
          title={`${d}${set.has(d) ? ": active" : ""}`}
          className={`w-2.5 h-4 rounded-[1px] ${set.has(d) ? "bg-jade-500" : "bg-ink/[0.08]"}`}
        />
      ))}
    </div>
  );
}

function Tile({ label, value, dot, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-paper rounded-sm shadow-card p-4 border-t-2 transition-colors ${active ? "border-jade-500" : "border-transparent hover:border-ink/15"}`}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 flex items-center gap-1.5">
        {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />} {label}
      </p>
      <p className="font-display text-2xl text-ink font-nums mt-1">{value}</p>
    </button>
  );
}

export default function TeamPulse() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [bucket, setBucket] = useState("all");
  const [location, setLocation] = useState("");
  const [search, setSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    setRefreshing(true);
    api.get("/api/policy/team-pulse", { params: { include_inactive: includeInactive } })
      .then(({ data }) => { setData(data); setError(""); })
      .catch((err) => setError(err.response?.data?.detail || "Could not load Team Pulse"))
      .finally(() => setRefreshing(false));
  }, [includeInactive]);

  useEffect(() => {
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  const days = useMemo(() => (data ? windowDays(data.window_start, data.window_days) : []), [data]);
  const locations = useMemo(
    () => [...new Set((data?.employees || []).map((r) => r.location).filter(Boolean))].sort(),
    [data],
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.employees || []).filter((r) =>
      (bucket === "all" || r.bucket === bucket)
      && (!location || r.location === location)
      && (!q || [r.name, r.employee_code, r.department, r.designation].some((v) => (v || "").toLowerCase().includes(q))));
  }, [data, bucket, location, search]);

  const exportCsv = () => {
    const header = ["Employee Code", "Name", "Department", "Location", "Last active (IST)", "Source", "Last login (IST)", `Logins (last ${data.window_days} days)`, `Active days (last ${data.window_days})`, "Last device"];
    const lines = rows.map((r) => [
      r.employee_code, r.name, r.department || "", r.location || "", exact(r.last_active_at),
      r.last_active_source === "policy_signoff" ? "Policy sign-off" : r.last_active_source ? "Tracked" : "",
      exact(r.last_login_at), r.logins_in_window, r.active_days.length, r.last_device,
    ]);
    const csv = [header, ...lines].map((c) => c.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `team-pulse-${data.today}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (error) return <p className="text-sm text-rust-500">{error}</p>;
  if (!data) return <p className="text-sm text-ink/70">Loading Team Pulse…</p>;

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        {BUCKETS.slice(1).map((b) => (
          <Tile
            key={b.key}
            label={b.label}
            dot={b.dot}
            value={data.counts[b.key]}
            active={bucket === b.key}
            onClick={() => setBucket(bucket === b.key ? "all" : b.key)}
          />
        ))}
      </div>

      <p className="text-xs text-ink/60 mb-4">
        Sign-ins are recorded from {new Date(`${data.tracking_started}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}.
        For anyone not seen since then, their policy sign-off time is shown as the last known activity.
        Updates every minute.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/70" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, code, department…"
            className="w-64 rounded-sm border border-ink/15 bg-paper pl-9 pr-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          />
        </div>
        <select value={bucket} onChange={(e) => setBucket(e.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
          {BUCKETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
        </select>
        <select value={location} onChange={(e) => setLocation(e.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
          <option value="">All locations</option>
          {locations.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-ink/70">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)}
            className="h-3.5 w-3.5 rounded-sm border-ink/30 text-jade-600 focus:ring-jade-500" />
          Include inactive
        </label>
        <button type="button" onClick={exportCsv}
          className="flex items-center gap-1.5 bg-paper border border-ink/15 text-ink/80 px-3 py-2 rounded-sm text-xs font-medium hover:border-ink/30 transition-colors">
          <Download size={13} /> Export CSV
        </button>
        <button type="button" onClick={load} disabled={refreshing} title="Refresh now"
          className="flex items-center gap-1.5 text-xs text-ink/60 hover:text-ink disabled:opacity-50">
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} />
        </button>
        <span className="text-xs text-ink/70 font-nums ml-auto">{rows.length} shown</span>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink/70 border-b border-ink/10 whitespace-nowrap">
              <th className="px-5 py-3">Employee</th>
              <th className="px-5 py-3">Department</th>
              <th className="px-5 py-3">Last active</th>
              <th className="px-5 py-3">Last login</th>
              <th className="px-5 py-3">
                <span className="inline-flex items-center gap-1"><Activity size={12} /> Last {data.window_days} days</span>
              </th>
              <th className="px-5 py-3 text-right">Logins</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td className="px-5 py-8 text-center text-ink/70" colSpan={6}>No one matches.</td></tr>
            ) : rows.map((r) => {
              const b = BUCKETS.find((x) => x.key === r.bucket);
              return (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${b?.dot || ""}`} title={b?.label} />
                      <span className="text-ink font-medium">{r.name}</span>
                      {!r.is_active && <span className="text-[10px] font-semibold uppercase tracking-wide text-ink/60">inactive</span>}
                    </div>
                    <div className="text-xs text-ink/60 font-nums pl-4">{r.employee_code}{r.location ? ` · ${r.location}` : ""}</div>
                  </td>
                  <td className="px-5 py-2.5 text-ink/70">{r.department || "—"}</td>
                  <td className="px-5 py-2.5 whitespace-nowrap" title={exact(r.last_active_at)}>
                    <span className={r.bucket === "today" ? "text-jade-700 font-medium" : "text-ink/80"}>{relative(r.last_active_at)}</span>
                    {r.last_active_source === "policy_signoff" && (
                      <span className="block text-[10px] uppercase tracking-wide text-ink/50">via policy sign-off</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 whitespace-nowrap text-ink/70" title={exact(r.last_login_at)}>
                    {r.last_login_at ? relative(r.last_login_at) : "—"}
                    {r.last_device && (
                      <span className="flex items-center gap-1 text-[11px] text-ink/50"><MonitorSmartphone size={11} /> {r.last_device}</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5"><PulseStrip days={days} active={r.active_days} /></td>
                  <td className="px-5 py-2.5 text-right font-nums text-ink/70">{r.logins_in_window}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
