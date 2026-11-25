import { Check, MapPin, X } from "lucide-react";
import { useEffect, useState } from "react";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatFullDate, formatTime } from "../../lib/format.js";
import SlidingTabs from "../../components/SlidingTabs.jsx";

import EmptyState from "../../components/EmptyState.jsx";
function formatDateTime(iso) {
  if (!iso) return "-";
  return `${formatFullDate(iso)}, ${formatTime(iso)}`;
}

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function ResolveRow({ visit, onResolved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = async (action) => {
    setBusy(true);
    try {
      await api.post(`/api/market-visits/${visit.id}/resolve`, { action, note });
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  const employee = visit.hr_employees;

  return (
    <tr className="border-b border-ink/[0.06] last:border-0 align-top">
      <td className="px-5 py-3.5">
        {visit.photo_url ? (
          <a href={visit.photo_url} target="_blank" rel="noreferrer">
            <img src={visit.photo_url} alt="Check-in" className="w-16 h-16 rounded-sm object-cover" />
          </a>
        ) : (
          <span className="text-xs text-ink/70">No photo</span>
        )}
      </td>
      <td className="px-5 py-3.5">
        <span className="text-ink font-medium">{employee?.first_name} {employee?.last_name}</span>
        <div className="text-xs text-ink/70 font-nums">{employee?.employee_code}</div>
        <div className="text-xs text-ink/70">{visit.visit_type === "check_out" ? "Check-out" : "Check-in"}{visit.place ? ` · ${visit.place}` : ""}{visit.place_type && visit.place_type !== "market" ? ` (${visit.place_type})` : ""}</div>
      </td>
      <td className="px-5 py-3.5 font-nums text-ink/70">{formatDateTime(visit.captured_at)}</td>
      <td className="px-5 py-3.5">
        <a
          href={`https://www.google.com/maps?q=${visit.latitude},${visit.longitude}`}
          target="_blank" rel="noreferrer"
          className="flex items-center gap-1 text-jade-600 underline font-nums text-xs"
        >
          <MapPin size={12} /> {Number(visit.latitude).toFixed(5)}, {Number(visit.longitude).toFixed(5)}
        </a>
      </td>
      <td className="px-5 py-3.5">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Note (optional)" placeholder="Note (optional)"
          className="w-40 rounded-sm border border-ink/15 bg-manila/40 px-4 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-jade-500"
        />
      </td>
      <td className="px-5 py-3.5">
        <div className="flex gap-6">
          <button
            disabled={busy}
            onClick={() => resolve("approve")}
            className="flex items-center gap-1 bg-jade-600 text-white px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors"
          >
            <Check size={13} /> Approve check-in
          </button>
          <button
            disabled={busy}
            onClick={() => resolve("reject")}
            className="flex items-center gap-1 bg-paper border border-rust-500 text-rust-500 px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-rust-50 disabled:opacity-50 transition-colors"
          >
            <X size={13} /> Reject check-in
          </button>
        </div>
      </td>
    </tr>
  );
}

function GeofencePanel() {
  const [fences, setFences] = useState(null);
  const [edit, setEdit] = useState({});
  const [msg, setMsg] = useState("");
  const load = () => api.get("/api/market-visits/geofences/admin").then(({ data }) => setFences(data)).catch(() => setFences([]));
  useEffect(() => { load(); }, []);
  if (!fences || !fences.length) return null;
  const val = (f, k) => (edit[f.id]?.[k] ?? f[k] ?? "");
  const set = (f, k, v) => setEdit((e) => ({ ...e, [f.id]: { ...e[f.id], [k]: v } }));
  const here = (f) => {
    setMsg("");
    if (!navigator.geolocation) { setMsg("This browser cannot share a location."); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => { set(f, "latitude", p.coords.latitude.toFixed(6)); set(f, "longitude", p.coords.longitude.toFixed(6)); setMsg(`Got your position (about ±${Math.round(p.coords.accuracy)} m). Check it, then save.`); },
      () => setMsg("Could not get your location. Allow location access, or type the coordinates."), { enableHighAccuracy: true, timeout: 20000 });
  };
  const save = async (f) => {
    setMsg("");
    try {
      await api.put(`/api/market-visits/geofences/${f.id}`, {
        latitude: Number(val(f, "latitude")), longitude: Number(val(f, "longitude")), radius_m: Number(val(f, "radius_m")) || 100,
      });
      setEdit((e) => { const c = { ...e }; delete c[f.id]; return c; });
      setMsg("Saved. Check-ins at this store are now locked to its radius.");
      load();
    } catch (err) { setMsg(err.response?.data?.detail || "Could not save"); }
  };
  const inp = "w-36 rounded-sm border border-ink/15 bg-manila/40 px-3 py-1.5 text-xs font-nums focus:outline-none focus:ring-2 focus:ring-jade-500";
  return (
    <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
      <p className="text-xs font-semibold text-ink/70 mb-1">Store geolock</p>
      <p className="text-xs text-ink/60 mb-3">A check-in at a store counts only within its radius. Stand at the store, press "Use my location", save. Until a point is confirmed, nothing is blocked.</p>
      {fences.map((f) => (
        <div key={f.id} className="flex flex-wrap items-end gap-3 mb-2">
          <div className="min-w-[12rem]"><p className="text-sm text-ink font-medium">{f.name}</p><p className="text-[11px] text-ink/60">{f.center_confirmed ? "Lock is ON" : "Point not confirmed, lock is OFF"}</p></div>
          <label className="text-[11px] text-ink/70">Latitude<input aria-label="Latitude" className={`${inp} block`} value={val(f, "latitude")} onChange={(e) => set(f, "latitude", e.target.value)} /></label>
          <label className="text-[11px] text-ink/70">Longitude<input aria-label="Longitude" className={`${inp} block`} value={val(f, "longitude")} onChange={(e) => set(f, "longitude", e.target.value)} /></label>
          <label className="text-[11px] text-ink/70">Radius (m)<input aria-label="Radius in metres" className={`${inp} block w-24`} value={val(f, "radius_m")} onChange={(e) => set(f, "radius_m", e.target.value)} /></label>
          <button type="button" onClick={() => here(f)} className="text-xs text-jade-700 hover:underline pb-2">Use my location</button>
          <button type="button" onClick={() => save(f)} className="bg-ledger-800 text-manila px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-ledger-700">Save point</button>
        </div>
      ))}
      {msg && <p className="text-xs text-ink/80 mt-2">{msg}</p>}
    </div>
  );
}

export default function MarketVisits() {
  const [tab, setTab] = useState("pending");
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/api/market-visits", { params: { status: tab } }).then(({ data }) => setVisits(data)).finally(() => setLoading(false));
  };

  useEffect(load, [tab]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ink">Market Visit Check-ins</h2>
        <p className="text-xs text-ink/70 font-nums mt-0.5">Geotagged field check-ins — photo + location logged as-is, no verification against a known location</p>
      </div>

      <GeofencePanel />

      <SlidingTabs tabs={TABS} value={tab} onChange={setTab} className="flex gap-1 mb-4" />

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left sticky top-0 z-10 bg-paper shadow-edge">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Photo</th>
              <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Employee</th>
              <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Checked in</th>
              <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Location</th>
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Note</th>}
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Action</th>}
              {tab !== "pending" && <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Status</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={6}><span className="t-shimmer" data-text="Loading…">Loading…</span></td></tr>
            ) : visits.length === 0 ? (
              <tr><td colSpan={6}><EmptyState title={`No ${tab} check-ins`} action={tab === "pending" ? { label: "View approved", onClick: () => setTab("approved") } : { label: "View pending", onClick: () => setTab("pending") }}>Check-ins show here once an employee checks in at a market visit.</EmptyState></td></tr>
            ) : tab === "pending" ? (
              visits.map((v) => <ResolveRow key={v.id} visit={v} onResolved={load} />)
            ) : (
              visits.map((v) => (
                <tr key={v.id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    {v.photo_url ? (
                      <a href={v.photo_url} target="_blank" rel="noreferrer">
                        <img src={v.photo_url} alt="Check-in" className="w-16 h-16 rounded-sm object-cover" />
                      </a>
                    ) : (
                      <span className="text-xs text-ink/70">No photo</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{v.hr_employees?.first_name} {v.hr_employees?.last_name}</span>
                    <div className="text-xs text-ink/70 font-nums">{v.hr_employees?.employee_code}</div>
                    <div className="text-xs text-ink/70">{v.visit_type === "check_out" ? "Check-out" : "Check-in"}{v.place ? ` · ${v.place}` : ""}{v.place_type && v.place_type !== "market" ? ` (${v.place_type})` : ""}</div>
                  </td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatDateTime(v.captured_at)}</td>
                  <td className="px-5 py-3.5">
                    <a
                      href={`https://www.google.com/maps?q=${v.latitude},${v.longitude}`}
                      target="_blank" rel="noreferrer"
                      className="flex items-center gap-1 text-jade-600 underline font-nums text-xs"
                    >
                      <MapPin size={12} /> {Number(v.latitude).toFixed(5)}, {Number(v.longitude).toFixed(5)}
                    </a>
                  </td>
                  <td className="px-5 py-3.5"><StampBadge status={v.status}>{v.status}</StampBadge></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
