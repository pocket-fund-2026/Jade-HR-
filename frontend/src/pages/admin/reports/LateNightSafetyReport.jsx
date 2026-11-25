import { ArrowLeft, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../../lib/api.js";

import EmptyState from "../../../components/EmptyState.jsx";
function formatTime(iso) {
  // Pinned to IST regardless of the viewing browser's own timezone — every
  // other time display in this codebase does the same (see attendanceExport.js);
  // this one matters more than most, since it drives real transport arrangements.
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export default function LateNightSafetyReport() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cutoffHour, setCutoffHour] = useState(22);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = () => {
    setLoading(true);
    setError("");
    api.get("/api/late-policy/v3/late-night-safety", { params: { date, cutoff_hour: cutoffHour } })
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.detail || "Could not load report"))
      .finally(() => setLoading(false));
  };

  useEffect(search, []);

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to reports
      </Link>
      <h2 className="font-display text-2xl text-ink mt-2 mb-1">Late-Working Safety</h2>
      <p className="text-xs text-ink/70 font-nums mb-6">Doc §26 — women employees whose last punch was after the cutoff hour, so transport can be arranged. A reporting list only; it books nothing.</p>

      <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label htmlFor="fld-44" className="block text-xs font-semibold text-ink/70 mb-1.5">Date</label>
            <input id="fld-44"
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-sm border border-ink/15 bg-paper px-4 py-2 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
            />
          </div>
          <div>
            <label htmlFor="fld-51" className="block text-xs font-semibold text-ink/70 mb-1.5">Cutoff Hour (24h)</label>
            <input id="fld-51"
              type="number" min={0} max={23} value={cutoffHour} onChange={(e) => setCutoffHour(Number(e.target.value))}
              className="w-full rounded-sm border border-ink/15 bg-paper px-4 py-2 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
            />
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={search}
            className="bg-ledger-800 text-on-jade px-[1.5em] py-[0.625em] leading-tight rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
          >
            Search
          </button>
        </div>
        {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mt-3">{error}</p>}
      </div>

      {loading && <p className="text-ink/70"><span className="t-shimmer" data-text="Loading…">Loading…</span></p>}

      {data && !loading && (
        <div className="bg-paper rounded-sm shadow-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left sticky top-0 z-10 bg-paper shadow-edge">
                <tr className="border-b-2 border-ink/10">
                  <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Employee</th>
                  <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Location</th>
                  <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Last out</th>
                </tr>
              </thead>
              <tbody>
                {data.employees.length === 0 ? (
                  <tr><td colSpan={3}><EmptyState title={`No women employees exited after ${cutoffHour}:00 on this date`} action={{ label: "Open attendance report", to: "/admin/reports/attendance" }}>Pick another date to check.</EmptyState></td></tr>
                ) : (
                  data.employees.map((e) => (
                    <tr key={e.employee_id} className="border-b border-ink/[0.06] last:border-0">
                      <td className="px-5 py-3.5">
                        <span className="text-ink font-medium flex items-center gap-1.5">
                          <ShieldAlert size={13} className="text-ochre-600" /> {e.name}
                        </span>
                        <div className="text-xs text-ink/70 font-nums">{e.employee_code}</div>
                      </td>
                      <td className="px-5 py-3.5 text-ink/70">{e.location || "—"}</td>
                      <td className="px-5 py-3.5 font-nums text-ink/70">{formatTime(e.last_out)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
