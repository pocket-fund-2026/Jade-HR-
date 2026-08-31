import { Check, X } from "lucide-react";
import { useEffect, useState } from "react";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

function ConfirmRow({ request, onResolved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async (confirmed) => {
    setBusy(true);
    try {
      await api.post(`/api/wfh-requests/${request.id}/confirm-completion`, { confirmed, note });
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
      <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(request.start_date)}–{formatDate(request.end_date)}</td>
      <td className="px-5 py-3.5 max-w-xs text-ink/70">{request.reason}</td>
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
            onClick={() => confirm(true)}
            className="flex items-center gap-1 bg-jade-600 text-white px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors"
          >
            <Check size={13} /> Work Completed
          </button>
          <button
            disabled={busy}
            onClick={() => confirm(false)}
            className="flex items-center gap-1 bg-paper border border-rust-500 text-rust-500 px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-rust-50 disabled:opacity-50 transition-colors"
          >
            <X size={13} /> Not Completed
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function TeamWFH() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/api/wfh-requests/my-team", { params: { status: "approved" } }).then(({ data }) => setRequests(data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const awaitingConfirmation = requests.filter((r) => r.work_completed === null || r.work_completed === undefined);
  const confirmed = requests.filter((r) => r.work_completed !== null && r.work_completed !== undefined);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ink">Team WFH</h2>
        <p className="text-xs text-ink/70 font-nums mt-0.5">Approved Work From Home requests from people who report to you — confirm the assigned work was completed</p>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto mb-6">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Dates</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Reason</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Note</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={5}>Loading ledger…</td></tr>
            ) : awaitingConfirmation.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={5}>No approved WFH requests awaiting your confirmation.</td></tr>
            ) : (
              awaitingConfirmation.map((r) => <ConfirmRow key={r.id} request={r} onResolved={load} />)
            )}
          </tbody>
        </table>
      </div>

      {confirmed.length > 0 && (
        <div className="bg-paper rounded-sm shadow-card overflow-hidden">
          <p className="px-5 pt-4 pb-3 text-xs font-semibold uppercase tracking-wider text-ink/70">Already confirmed</p>
          <table className="w-full text-sm">
            <tbody>
              {confirmed.map((r) => (
                <tr key={r.id} className="border-t border-ink/[0.06]">
                  <td className="px-5 py-3 font-nums text-ink/70 w-56">
                    {r.hr_employees?.first_name} {r.hr_employees?.last_name}
                    <div className="text-xs text-ink/70">{r.hr_employees?.employee_code}</div>
                  </td>
                  <td className="px-5 py-3 font-nums text-ink/70 w-40">{formatDate(r.start_date)}–{formatDate(r.end_date)}</td>
                  <td className="px-5 py-3">
                    <StampBadge status={r.work_completed ? "approved" : "rejected"}>
                      {r.work_completed ? "Completed — 50% pay" : "Not completed"}
                    </StampBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
