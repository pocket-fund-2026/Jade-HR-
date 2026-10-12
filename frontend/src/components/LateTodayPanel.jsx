import { AlarmClock, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import api from "../lib/api.js";

// Dashboard right rail: who came in late today (or a previous day), by the
// exact same rules as the daily late digest email and the payslip —
// GET /api/attendance/late-today wraps routers/payroll._late_arrivals.

const REFRESH_MS = 5 * 60 * 1000;

function isoDay(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function shiftDay(iso, delta) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + delta);
  if (d.getDay() === 0) d.setDate(d.getDate() + (delta < 0 ? -1 : 1)); // skip Sundays
  return isoDay(d);
}

function dayLabel(iso, todayIso) {
  if (iso === todayIso) return "Today";
  if (iso === shiftDay(todayIso, -1)) return "Yesterday";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

const CARD_STYLES = {
  red: "bg-rust-500 text-white",
  yellow: "bg-ochre-400 text-ink",
};

export default function LateTodayPanel() {
  const todayIso = isoDay(new Date());
  const [day, setDay] = useState(todayIso);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/api/attendance/late-today", { params: { for_date: day } })
      .then(({ data }) => { setData(data); setError(""); })
      .catch((err) => setError(err.response?.data?.detail || "Could not load late arrivals"))
      .finally(() => setLoading(false));
  }, [day]);

  useEffect(() => {
    load();
    if (day !== todayIso) return undefined;
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [load, day, todayIso]);

  const rows = data?.late || [];
  const visible = showAll ? rows : rows.slice(0, 8);
  const byLocation = useMemo(() => {
    const m = {};
    for (const r of rows) m[r.location || "Other"] = (m[r.location || "Other"] || 0) + 1;
    return Object.entries(m).sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const syncedBeforeDay = data?.last_sync_at && isoDay(new Date(data.last_sync_at)) < day;

  return (
    <section className="bg-paper rounded-sm shadow-card overflow-hidden" aria-labelledby="late-today-title">
      <div className="bg-ledger-800 text-manila px-4 py-3 flex items-center justify-between gap-2">
        <h3 id="late-today-title" className="flex items-center gap-2 font-display text-base">
          <AlarmClock size={16} className="text-ochre-400" /> Late arrivals
        </h3>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setDay(shiftDay(day, -1))} aria-label="Previous day" className="p-1 rounded-sm hover:bg-manila/10"><ChevronLeft size={15} /></button>
          <span className="text-xs font-semibold min-w-[74px] text-center">{dayLabel(day, todayIso)}</span>
          <button type="button" onClick={() => setDay(shiftDay(day, 1))} disabled={day >= todayIso} aria-label="Next day" className="p-1 rounded-sm hover:bg-manila/10 disabled:opacity-30"><ChevronRight size={15} /></button>
        </div>
      </div>

      <div className="px-4 pt-3 pb-2 flex items-end justify-between border-b border-ink/10">
        <div>
          <p className="font-display text-3xl text-ink font-nums leading-none">{loading && !data ? "–" : rows.length}</p>
          <p className="text-[11px] text-ink/60 mt-1">{rows.length === 1 ? "person" : "people"} in after their cutoff</p>
        </div>
        <button type="button" onClick={load} disabled={loading} title="Refresh" className="text-ink/50 hover:text-ink disabled:opacity-40 mb-1">
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {error ? (
        <p className="px-4 py-4 text-sm text-rust-500">{error}</p>
      ) : rows.length === 0 ? (
        <p className="px-4 py-5 text-sm text-ink/60">
          {loading ? "Loading…" : syncedBeforeDay
            ? "Today's punches haven't synced yet. Check back after the next biometric sync."
            : "Nobody came in late."}
        </p>
      ) : (
        <>
          {byLocation.length > 1 && (
            <div className="px-4 pt-2.5 flex flex-wrap gap-1.5">
              {byLocation.map(([loc, n]) => (
                <span key={loc} className="text-[10.5px] bg-manila text-ink/70 px-1.5 py-0.5 rounded-sm">{loc.split(",")[0]} · {n}</span>
              ))}
            </div>
          )}
          <ul className="divide-y divide-ink/[0.07] mt-1.5">
            {visible.map((r) => (
              <li key={r.employee_id}>
                <Link to={`/admin/employees/${r.employee_id}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-manila/40 transition-colors">
                  <span className="font-nums text-sm font-semibold text-rust-600 w-[66px] flex-shrink-0">{r.time}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-ink truncate">{r.name}</span>
                    <span className="block text-[11px] text-ink/55 truncate">{r.department || r.location || r.employee_code}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5 flex-shrink-0">
                    {r.late_card && CARD_STYLES[r.late_card] && (
                      <span className={`text-[9.5px] font-bold uppercase tracking-wide px-1.5 py-[1px] rounded-sm ${CARD_STYLES[r.late_card]}`}>{r.late_card}</span>
                    )}
                    {r.late_mark_count != null && (
                      <span className="text-[10.5px] text-ink/55 font-nums" title="Late marks this pay period">{r.late_mark_count} this period</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {rows.length > 8 && (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="w-full text-xs font-semibold text-jade-700 hover:bg-manila/40 py-2 border-t border-ink/10">
              {showAll ? "Show fewer" : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}

      <div className="px-4 py-2.5 border-t border-ink/10 flex items-center justify-between text-[11px] text-ink/55">
        <span>
          {data?.last_sync_at
            ? `Punches synced ${new Date(data.last_sync_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
            : ""}
        </span>
        <Link to="/admin/reports/attendance" className="text-jade-700 font-semibold hover:underline">Attendance sheet</Link>
      </div>
    </section>
  );
}
