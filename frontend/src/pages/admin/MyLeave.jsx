import { CalendarPlus } from "lucide-react";
import LeaveProofField, { LeaveProofLink, uploadLeaveProof } from "../../components/LeaveProofField.jsx";
import { useEffect, useState } from "react";

import StampBadge from "../../components/StampBadge.jsx";
import useLeaveCutoff from "../../lib/useLeaveCutoff.js";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { formatDate } from "../../lib/format.js";
import { LEAVE_LABELS, selectableLeaveTypes } from "../../lib/leaveTypes.js";

import EmptyState from "../../components/EmptyState.jsx";
export default function MyLeave() {
  const { user } = useAuth();
  const isCorporate = user?.employee_category === "corporate";
  const availableTypes = selectableLeaveTypes(isCorporate);
  const cutoff = useLeaveCutoff();
  const [balance, setBalance] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [leaveType, setLeaveType] = useState("paid");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [reason, setReason] = useState("");
  const [proof, setProof] = useState(null);
  const [session, setSession] = useState("first");
  const isHalf = leaveType === "half_day";
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
    if (!startDate || (!isHalf && !endDate)) {
      setError("Start and end date are required.");
      return;
    }
    setSubmitting(true);
    try {
      const proofFields = await uploadLeaveProof(proof);
      await api.post("/api/me/leave-requests", { ...proofFields, leave_type: leaveType, start_date: startDate, end_date: isHalf ? startDate : endDate, reason, ...(isHalf ? { half_day_session: session } : {}) });
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
      <h2 className="font-display text-2xl text-ink mb-1">My leave</h2>
      <p className="text-sm text-ink/70 mb-6">Submit and track your own leave requests.</p>

      {loading ? (
        <p className="text-ink/70 text-sm"><span className="t-shimmer" data-text="Loading…">Loading…</span></p>
      ) : (
        <>
          {balance.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
              {balance.filter((b) => b.allocated !== null).map((b) => (
                <div key={b.leave_type} className="bg-paper rounded-sm shadow-card px-4 py-3 border-t-2 border-ink/10">
                  <p className="text-[11px] font-semibold text-ink/70">{LEAVE_LABELS[b.leave_type] || b.leave_type}</p>
                  <p className="font-display text-lg text-ink mt-0.5">{b.remaining} <span className="text-xs text-ink/70 font-sans">/ {b.allocated}</span></p>
                  {b.carried_forward > 0 && (
                    <p className="text-[10px] text-ink/70 mt-0.5">incl. {Number(b.carried_forward).toFixed(1)} carried forward</p>
                  )}
                </div>
              ))}
            </div>
          )}

          <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-5 mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label htmlFor="fld-88" className="block text-xs font-semibold text-ink/70 mb-1.5">Leave type</label>
                <select id="fld-88" value={leaveType} onChange={(e) => setLeaveType(e.target.value)}
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
                  {availableTypes.map((v) => <option key={v} value={v}>{LEAVE_LABELS[v]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="fld-95" className="block text-xs font-semibold text-ink/70 mb-1.5">Start date</label>
                <input id="fld-95" type="date" required min={cutoff?.earliest_date} value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
              </div>
              <div>
                <label htmlFor="myleave_end" className="block text-xs font-semibold text-ink/70 mb-1.5">{isHalf ? "Which half" : "End date"}</label>
                {isHalf ? (
                  <select id="myleave_end" value={session} onChange={(e) => setSession(e.target.value)}
                    className="w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
                    <option value="first">First half (morning off)</option>
                    <option value="second">Second half (afternoon off)</option>
                  </select>
                ) : (
                <input id="myleave_end" type="date" required min={cutoff?.earliest_date} value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
                )}
              </div>
            </div>
            <div className="mt-4">
              <label htmlFor="fld-114" className="block text-xs font-semibold text-ink/70 mb-1.5">Reason</label>
              <input id="fld-114" type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Optional"
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
            </div>
            <div className="mt-4"><LeaveProofField file={proof} onChange={setProof} /></div>
            {error && <p className="text-sm text-rust-500 mt-3">{error}</p>}
            <div className="flex justify-end mt-4">
              <button type="submit" disabled={submitting}
                className="flex items-center gap-1.5 bg-jade-600 text-white px-[1.5em] py-[0.625em] leading-tight rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors">
                <CalendarPlus size={14} /> {submitting ? "Submitting…" : "Submit leave request"}
              </button>
            </div>
          </form>

          <div className="bg-paper rounded-sm shadow-card divide-y divide-ink/[0.06]">
            {requests.length === 0 ? (
              <EmptyState title="No leave requests yet" action={{ label: "Request leave", onClick: () => document.getElementById("fld-88")?.focus() }}>Requests you file show up here with their status.</EmptyState>
            ) : (
              requests.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
                  <div>
                    <p className="text-sm text-ink font-medium">{LEAVE_LABELS[r.leave_type] || r.leave_type}</p>
                    <p className="text-xs text-ink/70 mt-0.5">
                      {formatDate(r.start_date)} – {formatDate(r.end_date)}
                      {r.reason && ` · ${r.reason}`}
                    </p>
                    <LeaveProofLink request={r} />
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
