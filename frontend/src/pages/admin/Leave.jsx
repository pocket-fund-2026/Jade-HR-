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

const LEAVE_LABELS = { casual: "Casual", sick: "Sick", earned: "Earned", unpaid: "Unpaid", other: "Other" };

function ResolveRow({ request, onResolved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = async (action) => {
    setBusy(true);
    try {
      await api.put(`/api/leave-requests/${request.id}`, { action, admin_note: note });
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  const employee = request.hr_employees;
  const days = (new Date(request.end_date) - new Date(request.start_date)) / 86400000 + 1;

  return (
    <tr className="border-b border-ink/[0.06] last:border-0 align-top">
      <td className="px-5 py-3.5">
        <span className="text-ink font-medium">{employee?.first_name} {employee?.last_name}</span>
        <div className="text-xs text-ink/40 font-nums">{employee?.employee_code}</div>
      </td>
      <td className="px-5 py-3.5 text-ink/70">{LEAVE_LABELS[request.leave_type]}</td>
      <td className="px-5 py-3.5 font-nums text-ink/70">
        {formatDate(request.start_date)}–{formatDate(request.end_date)}
        <div className="text-xs text-ink/40">{days} day{days > 1 ? "s" : ""}</div>
      </td>
      <td className="px-5 py-3.5 max-w-xs text-ink/70">{request.reason}</td>
      <td className="px-5 py-3.5">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
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

export default function Leave() {
  const [tab, setTab] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/api/leave-requests", { params: { status: tab } }).then(({ data }) => setRequests(data)).finally(() => setLoading(false));
  };

  useEffect(load, [tab]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ink">Leave Requests</h2>
        <p className="text-xs text-ink/40 font-nums mt-0.5">Casual, sick, earned & unpaid leave</p>
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
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Type</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Dates</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Reason</th>
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Note</th>}
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Action</th>}
              {tab !== "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Status</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/40 text-center" colSpan={6}>Loading…</td></tr>
            ) : requests.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/40 text-center" colSpan={6}>No {tab} leave requests.</td></tr>
            ) : tab === "pending" ? (
              requests.map((r) => <ResolveRow key={r.id} request={r} onResolved={load} />)
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</span>
                    <div className="text-xs text-ink/40 font-nums">{r.hr_employees?.employee_code}</div>
                  </td>
                  <td className="px-5 py-3.5 text-ink/70">{LEAVE_LABELS[r.leave_type]}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(r.start_date)}–{formatDate(r.end_date)}</td>
                  <td className="px-5 py-3.5 text-ink/70 max-w-xs">{r.reason}</td>
                  <td className="px-5 py-3.5"><StampBadge status={r.status}>{r.status}</StampBadge></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
