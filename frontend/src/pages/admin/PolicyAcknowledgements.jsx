import { CheckCircle2, Clock, Download, Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import api from "../../lib/api.js";

const STATUS_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "pending", label: "Not yet acknowledged" },
  { value: "acknowledged", label: "Acknowledged" },
];

function formatWhen(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export default function PolicyAcknowledgements() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("all");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    api
      .get("/api/policy/acknowledgements", { params: { status, include_inactive: includeInactive } })
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.detail || "Could not load the acknowledgement register"))
      .finally(() => setLoading(false));
  }, [status, includeInactive]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = data?.employees || [];
    if (!q) return all;
    return all.filter((r) =>
      [r.name, r.employee_code, r.department, r.designation, r.location]
        .some((v) => (v || "").toLowerCase().includes(q)));
  }, [data, search]);

  const exportCsv = () => {
    const header = ["Employee Code", "Name", "Department", "Designation", "Location", "Status", "Quiz Score", "Quiz Attempts", "Acknowledged At (IST)"];
    const lines = rows.map((r) => [
      r.employee_code, r.name, r.department || "", r.designation || "", r.location || "",
      r.acknowledged ? "Acknowledged" : "Pending",
      r.quiz_score != null ? `${r.quiz_score}/${r.quiz_total}` : "",
      r.quiz_attempts || 0,
      r.acknowledged ? formatWhen(r.acknowledged_at) : "",
    ]);
    const csv = [header, ...lines]
      .map((cells) => cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `policy-acknowledgements-${data?.policy_version || "current"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={20} className="text-jade-600" />
        <h2 className="font-display text-2xl text-ink">Policy Sign-off</h2>
      </div>
      <p className="text-sm text-ink/70 mb-6">
        Who has read and acknowledged the company policy documents on login. Acknowledgements are recorded against a
        policy version{data?.policy_version && <> — currently <span className="font-nums">{data.policy_version}</span></>};
        when the policy changes materially the version is raised and everyone is asked to read and accept again.
      </p>

      {loading ? (
        <p className="text-sm text-ink/70">Loading register…</p>
      ) : error ? (
        <p className="text-sm text-rust-500">{error}</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="bg-paper rounded-sm shadow-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">On roster</p>
              <p className="font-display text-2xl text-ink font-nums mt-1">{data.total}</p>
            </div>
            <div className="bg-paper rounded-sm shadow-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 flex items-center gap-1">
                <CheckCircle2 size={12} className="text-jade-600" /> Acknowledged
              </p>
              <p className="font-display text-2xl text-jade-700 font-nums mt-1">{data.acknowledged}</p>
            </div>
            <div className="bg-paper rounded-sm shadow-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 flex items-center gap-1">
                <Clock size={12} className="text-rust-500" /> Pending
              </p>
              <p className="font-display text-2xl text-rust-500 font-nums mt-1">{data.pending}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/70" />
              <input
                type="text" value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, code, department…"
                className="w-64 rounded-sm border border-ink/15 bg-paper pl-9 pr-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              />
            </div>
            <select value={status} onChange={(e) => setStatus(e.target.value)}
              className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
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
            <span className="text-xs text-ink/70 font-nums ml-auto">{rows.length} shown</span>
          </div>

          <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-ink/70 border-b border-ink/10">
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-5 py-3">Department</th>
                  <th className="px-5 py-3">Location</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Quiz</th>
                  <th className="px-5 py-3">Acknowledged (IST)</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr><td className="px-5 py-8 text-center text-ink/70" colSpan={6}>No employees match.</td></tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                      <td className="px-5 py-3">
                        <span className="text-ink font-medium">{r.name}</span>
                        {!r.is_active && (
                          <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-ink/70">inactive</span>
                        )}
                        <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                      </td>
                      <td className="px-5 py-3 text-ink/70">{r.department || "—"}</td>
                      <td className="px-5 py-3 text-ink/70">{r.location || "—"}</td>
                      <td className="px-5 py-3">
                        {r.acknowledged ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-jade-700">
                            <CheckCircle2 size={12} /> Acknowledged
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-rust-500">
                            <Clock size={12} /> Pending
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-nums text-ink/70">
                        {r.quiz_score != null ? (
                          <span className={r.quiz_passed ? "text-jade-700" : "text-rust-500"}>
                            {r.quiz_score}/{r.quiz_total}
                          </span>
                        ) : "—"}
                        {r.quiz_attempts > 1 && (
                          <span className="text-[10px] text-ink/50 ml-1">({r.quiz_attempts} attempts)</span>
                        )}
                      </td>
                      <td className="px-5 py-3 font-nums text-ink/70">{formatWhen(r.acknowledged_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
