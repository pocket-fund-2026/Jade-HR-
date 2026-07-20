import { Check, Paperclip, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function ResolveRow({ request, onResolved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = async (action) => {
    setBusy(true);
    try {
      await api.put(`/api/absence-requests/${request.id}`, { action, admin_note: note });
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  const employee = request.hr_employees;

  return (
    <tr className="border-b border-ink/[0.06] last:border-0 align-top">
      <td className="px-5 py-3.5">
        <span className="text-ink font-medium">{employee?.first_name || request.first_name} {employee?.last_name || request.last_name}</span>
        <div className="text-xs text-ink/70 font-nums">{request.employee_code}</div>
      </td>
      <td className="px-5 py-3.5 text-ink/70">{request.department || "—"}</td>
      <td className="px-5 py-3.5 font-nums text-ink/70">
        {formatDate(request.start_date)}–{formatDate(request.end_date)}
        <div className="text-xs text-ink/70">{request.number_of_days} day{request.number_of_days === 1 ? "" : "s"}</div>
      </td>
      <td className="px-5 py-3.5 max-w-xs text-ink/70">
        {request.details}
        {request.attachment_url && (
          <a href={request.attachment_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-jade-600 hover:underline mt-1 text-xs">
            <Paperclip size={11} /> {request.attachment_filename || "Attachment"}
          </a>
        )}
      </td>
      <td className="px-5 py-3.5 text-ink/70">
        {request.approver_name}
        <div className="text-xs text-ink/70">{request.approver_email}</div>
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

const POLL_MS = 20000;

export default function WorkAbsence() {
  const { pendingWorkAbsence: layoutPending, pendingLoaded } = useOutletContext() || {};
  const hasLayoutData = pendingLoaded && layoutPending !== undefined;
  const [tab, setTab] = useState("pending");
  const [requests, setRequests] = useState(() => (hasLayoutData ? layoutPending : []));
  const [loading, setLoading] = useState(!hasLayoutData);
  const [location, setLocation] = useState("all");
  const skipNextLoad = useRef(hasLayoutData);

  const load = (silent) => {
    if (!silent) setLoading(true);
    api.get("/api/absence-requests", { params: { status: tab } }).then(({ data }) => setRequests(data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (skipNextLoad.current) {
      skipNextLoad.current = false;
    } else {
      load();
    }
    if (tab !== "pending") return;
    const interval = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(interval);
  }, [tab]);

  const locations = useMemo(
    () => [...new Set(requests.map((r) => r.hr_employees?.location).filter(Boolean))].sort(),
    [requests],
  );
  const filtered = useMemo(
    () => (location === "all" ? requests : requests.filter((r) => r.hr_employees?.location === location)),
    [requests, location],
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Work Absence Requests</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">Work-related absences, notified to the employee's own named approver</p>
        </div>
        <select
          aria-label="Filter by location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
        >
          <option value="all">All locations</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
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
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Dept.</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Dates</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Details</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Approver</th>
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Note</th>}
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Action</th>}
              {tab !== "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={7}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={7}>No {tab} absence requests.</td></tr>
            ) : tab === "pending" ? (
              filtered.map((r) => <ResolveRow key={r.id} request={r} onResolved={load} />)
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{r.hr_employees?.first_name || r.first_name} {r.hr_employees?.last_name || r.last_name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                  </td>
                  <td className="px-5 py-3.5 text-ink/70">{r.department || "—"}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(r.start_date)}–{formatDate(r.end_date)}</td>
                  <td className="px-5 py-3.5 text-ink/70 max-w-xs">{r.details}</td>
                  <td className="px-5 py-3.5 text-ink/70">{r.approver_name}</td>
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
