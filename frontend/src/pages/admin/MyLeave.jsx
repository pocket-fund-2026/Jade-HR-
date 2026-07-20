import { CalendarPlus } from "lucide-react";
import { useEffect, useState } from "react";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { formatDate } from "../../lib/format.js";
import { LEAVE_LABELS, selectableLeaveTypes } from "../../lib/leaveTypes.js";

export default function MyLeave() {
  const { user } = useAuth();
  const isCorporate = user?.employee_category === "corporate";
  const availableTypes = selectableLeaveTypes(isCorporate);
  const [balance, setBalance] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leaveType, setLeaveType] = useState("paid");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/api/me/leave-balance"),
      api.get("/api/me/leave-requests"),
    ]).then(([b, r]) => {
      setBalance(b.data);
      setRequests(r.data);
    }).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!startDate || !endDate) {
      setError("Start and end date are required.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/me/leave-requests", { leave_type: leaveType, start_date: startDate, end_date: endDate, reason });
      setStartDate(""); setEndDate(""); setReason("");
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not submit — try again");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl text-ink mb-1">My Leave</h2>
      <p className="text-sm text-ink/70 mb-6">Submit and track your own leave requests.</p>

      {loading ? (
        <p className="text-ink/70 text-sm">Loading…</p>
      ) : (
        <>
          {balance.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {balance.filter((b) => b.allocated !== null).map((b) => (
                <div key={b.leave_type} className="bg-paper rounded-sm shadow-card px-4 py-3 border-t-2 border-ink/10">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">{LEAVE_LABELS[b.leave_type] || b.leave_type}</p>
                  <p className="font-display text-lg text-ink mt-0.5">{b.remaining} <span className="text-xs text-ink/50 font-sans">/ {b.allocated}</span></p>
                  {b.carried_forward > 0 && (
                    <p className="text-[10px] text-ink/50 mt-0.5">incl. {Number(b.carried_forward).toFixed(1)} carried forward</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-5 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Leave Type</label>
                <select value={leaveType} onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
                  {availableTypes.map((v) => <option key={v} value={v}>{LEAVE_LABELS[v]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Start Date</label>
                <input type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">End Date</label>
                <input type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Reason</label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
            </div>
            {error && <p className="text-sm text-rust-500 mt-3">{error}</p>}
            <div className="flex justify-end mt-4">
              <button type="submit" disabled={submitting}
                className="flex items-center gap-1.5 bg-jade-600 text-white px-4 py-2 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors">
                <CalendarPlus size={14} /> {submitting ? "Submitting…" : "Submit Request"}
              </button>
            </div>
          </form>

          <div className="bg-paper rounded-sm shadow-card divide-y divide-ink/[0.06]">
            {requests.length === 0 ? (
              <p className="px-5 py-8 text-ink/70 text-center text-sm">No leave requests yet.</p>
            ) : (
              requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div>
                    <p className="text-sm text-ink font-medium">{LEAVE_LABELS[r.leave_type] || r.leave_type}</p>
                    <p className="text-xs text-ink/70 mt-0.5">
                      {formatDate(r.start_date)} – {formatDate(r.end_date)}
                      {r.reason && ` · ${r.reason}`}
                    </p>
                  </div>
                  <StampBadge status={r.status}>{r.status}</StampBadge>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
