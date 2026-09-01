import { Check, MapPin, X } from "lucide-react";
import { useEffect, useState } from "react";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatFullDate, formatTime } from "../../lib/format.js";

function formatDateTime(iso) {
  if (!iso) return "-";
  return `${formatFullDate(iso)}, ${formatTime(iso)}`;
}

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
          className="w-40 rounded-sm border border-ink/15 bg-manila/40 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-jade-500"
        />
      </td>
      <td className="px-5 py-3.5">
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => resolve("approve")}
            className="flex items-center gap-1 bg-jade-600 text-white px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors"
          >
            <Check size={13} /> Approve
          </button>
          <button
            disabled={busy}
            onClick={() => resolve("reject")}
            className="flex items-center gap-1 bg-paper border border-rust-500 text-rust-500 px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-rust-50 disabled:opacity-50 transition-colors"
          >
            <X size={13} /> Reject
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function TeamMarketVisits() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/api/market-visits/my-team", { params: { status: "pending" } }).then(({ data }) => setVisits(data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ink">Team Market Visits</h2>
        <p className="text-xs text-ink/70 font-nums mt-0.5">Geotagged field check-ins from people who report to you</p>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Photo</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Checked in</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Location</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Note</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={6}>Loading…</td></tr>
            ) : visits.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={6}>No pending check-ins from your team.</td></tr>
            ) : (
              visits.map((v) => <ResolveRow key={v.id} visit={v} onResolved={load} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
