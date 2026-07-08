import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function ResolveRow({ dispute, onResolved }) {
  const [firstIn, setFirstIn] = useState(dispute.claimed_in?.slice(0, 5) || "");
  const [lastOut, setLastOut] = useState(dispute.claimed_out?.slice(0, 5) || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = async (action) => {
    setBusy(true);
    try {
      await api.put(`/api/disputes/${dispute.id}`, {
        action,
        admin_note: note,
        first_in: firstIn ? `${firstIn}:00` : null,
        last_out: lastOut ? `${lastOut}:00` : null,
        status_override: "present",
      });
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  const employee = dispute.hr_employees;

  return (
    <tr className="border-b border-ink/[0.06] last:border-0 align-top">
      <td className="px-5 py-3.5">
        <span className="text-ink font-medium">{employee?.first_name} {employee?.last_name}</span>
        <div className="text-xs text-ink/40 font-nums">{employee?.employee_code}</div>
      </td>
      <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(dispute.date)}</td>
      <td className="px-5 py-3.5 max-w-xs">
        <p className="text-ink/70">{dispute.reason}</p>
        <p className="text-xs text-ink/40 mt-0.5 uppercase tracking-wide">{dispute.issue_type.replace(/_/g, " ")}</p>
      </td>
      <td className="px-5 py-3.5">
        <div className="flex gap-2">
          <input
            type="time"
            value={firstIn}
            onChange={(e) => setFirstIn(e.target.value)}
            placeholder="In"
            className="w-24 rounded-sm border border-ink/15 bg-manila/40 px-2 py-1.5 text-xs font-nums focus:outline-none focus:ring-2 focus:ring-jade-500"
          />
          <input
            type="time"
            value={lastOut}
            onChange={(e) => setLastOut(e.target.value)}
            placeholder="Out"
            className="w-24 rounded-sm border border-ink/15 bg-manila/40 px-2 py-1.5 text-xs font-nums focus:outline-none focus:ring-2 focus:ring-jade-500"
          />
        </div>
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

const POLL_MS = 20000;

export default function Disputes() {
  const [tab, setTab] = useState("pending");
  const [disputes, setDisputes] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = (silent) => {
    if (!silent) setLoading(true);
    api.get("/api/disputes", { params: { status: tab } }).then(({ data }) => setDisputes(data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    if (tab !== "pending") return;
    const interval = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(interval);
  }, [tab]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ink">Attendance Disputes</h2>
        <p className="text-xs text-ink/40 font-nums mt-0.5">Employee-reported missed punches</p>
      </div>

      <div className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
              tab === t.key ? "bg-ledger-800 text-manila" : "bg-paper text-ink/50 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Employee</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Date</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Issue</th>
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Confirm times</th>}
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Action</th>}
              {tab !== "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Status</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/40 text-center" colSpan={5}>Loading…</td></tr>
            ) : disputes.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/40 text-center" colSpan={5}>No {tab} disputes.</td></tr>
            ) : tab === "pending" ? (
              disputes.map((d) => <ResolveRow key={d.id} dispute={d} onResolved={load} />)
            ) : (
              disputes.map((d) => (
                <tr key={d.id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{d.hr_employees?.first_name} {d.hr_employees?.last_name}</span>
                    <div className="text-xs text-ink/40 font-nums">{d.hr_employees?.employee_code}</div>
                  </td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(d.date)}</td>
                  <td className="px-5 py-3.5 text-ink/70 max-w-xs">{d.reason}</td>
                  <td className="px-5 py-3.5"><StampBadge status={d.status}>{d.status}</StampBadge></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
