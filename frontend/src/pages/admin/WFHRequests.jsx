import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { formatDate } from "../../lib/format.js";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function ResolveRow({ request, onResolved, canApprove }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = async (action) => {
    setBusy(true);
    try {
      await api.post(`/api/wfh-requests/${request.id}/resolve`, { action, note });
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  const employee = request.hr_employees;

  return (
    <tr className="border-b border-ink/[0.06] last:border-0 align-top">
      <td className="px-5 py-3.5">
        <span className="text-ink font-medium">{employee?.first_name} {employee?.last_name}</span>
        <div className="text-xs text-ink/70 font-nums">{employee?.employee_code}</div>
      </td>
      <td className="px-5 py-3.5 text-ink/70">{employee?.location || "—"}</td>
      <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(request.start_date)}–{formatDate(request.end_date)}</td>
      <td className="px-5 py-3.5 max-w-xs text-ink/70">{request.reason}</td>
      <td className="px-5 py-3.5">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={!canApprove}
          aria-label="Note (optional)" placeholder="Note (optional)"
          className="w-40 rounded-sm border border-ink/15 bg-manila/40 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-jade-500 disabled:opacity-50"
        />
      </td>
      <td className="px-5 py-3.5">
        {canApprove ? (
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
        ) : (
          <span className="text-xs text-ink/70">Senior Management / HR Head only</span>
        )}
      </td>
    </tr>
  );
}

export default function WFHRequests() {
  const { can } = useAuth();
  const canApprove = can("wfh.approve");
  const [tab, setTab] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/api/wfh-requests", { params: { status: tab } }).then(({ data }) => setRequests(data)).finally(() => setLoading(false));
  };

  useEffect(load, [tab]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ink">Work From Home Requests</h2>
        <p className="text-xs text-ink/70 font-nums mt-0.5">Senior Management / HR Head approval — completion is separately confirmed by the employee's Reporting Manager</p>
      </div>

      <div className="flex gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
              tab === t.key ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Location</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Dates</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Reason</th>
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Note</th>}
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Action</th>}
              {tab !== "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Completion</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={6}>Loading ledger…</td></tr>
            ) : requests.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={6}>No {tab} WFH requests.</td></tr>
            ) : tab === "pending" ? (
              requests.map((r) => <ResolveRow key={r.id} request={r} onResolved={load} canApprove={canApprove} />)
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.hr_employees?.employee_code}</div>
                  </td>
                  <td className="px-5 py-3.5 text-ink/70">{r.hr_employees?.location || "—"}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(r.start_date)}–{formatDate(r.end_date)}</td>
                  <td className="px-5 py-3.5 text-ink/70 max-w-xs">{r.reason}</td>
                  {tab === "approved" ? (
                    <td className="px-5 py-3.5">
                      {r.work_completed === true ? (
                        <StampBadge status="approved">Completed — 50% pay</StampBadge>
                      ) : r.work_completed === false ? (
                        <StampBadge status="rejected">Not completed</StampBadge>
                      ) : (
                        <StampBadge status="pending">Awaiting confirmation</StampBadge>
                      )}
                    </td>
                  ) : (
                    <td className="px-5 py-3.5"><StampBadge status={r.status}>{r.status}</StampBadge></td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
