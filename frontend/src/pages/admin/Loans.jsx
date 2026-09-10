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

function ResolveRow({ request, onResolved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = async (action) => {
    setBusy(true);
    try {
      await api.put(`/api/loan-requests/${request.id}`, { action, admin_note: note });
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
        ₹{Number(request.amount).toLocaleString("en-IN")}
        <div className="text-xs text-ink/70">{request.repayment_months} mo</div>
      </td>
      <td className="px-5 py-3.5 max-w-xs text-ink/70">{request.reason}</td>
      <td className="px-5 py-3.5 text-ink/70">
        {request.guarantor_name || "—"}
        {request.guarantor_employee_code && <div className="text-xs text-ink/70 font-nums">{request.guarantor_employee_code}</div>}
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

export default function Loans() {
  const [tab, setTab] = useState("pending");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/api/loan-requests", { params: { status: tab } }).then(({ data }) => setRequests(data)).finally(() => setLoading(false));
  };

  useEffect(load, [tab]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ink">Loan Requests</h2>
        <p className="text-xs text-ink/70 font-nums mt-0.5">Employee salary advance / loan requests</p>
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
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Amount</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Reason</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Guarantor</th>
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Note</th>}
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Action</th>}
              {tab !== "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={7}>Loading…</td></tr>
            ) : requests.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={7}>No {tab} loan requests.</td></tr>
            ) : tab === "pending" ? (
              requests.map((r) => <ResolveRow key={r.id} request={r} onResolved={load} />)
            ) : (
              requests.map((r) => (
                <tr key={r.id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{r.hr_employees?.first_name || r.first_name} {r.hr_employees?.last_name || r.last_name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                  </td>
                  <td className="px-5 py-3.5 text-ink/70">{r.department || "—"}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">₹{Number(r.amount).toLocaleString("en-IN")}<div className="text-xs text-ink/70">{r.repayment_months} mo</div></td>
                  <td className="px-5 py-3.5 text-ink/70 max-w-xs">{r.reason}</td>
                  <td className="px-5 py-3.5 text-ink/70">{r.guarantor_name || "—"}</td>
                  <td className="px-5 py-3.5"><StampBadge status={r.status}>{r.status}</StampBadge>{r.admin_note && <div className="text-xs text-ink/70 mt-1">{r.admin_note}</div>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
