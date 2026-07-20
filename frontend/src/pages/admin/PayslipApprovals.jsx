import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatINR } from "../../lib/format.js";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function ResolveRow({ approval, onResolved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const employee = approval.hr_employees;

  const resolve = async (action) => {
    setBusy(true);
    try {
      await api.put(`/api/payslip-approvals/${approval.id}`, { action, admin_note: note });
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-ink/[0.06] last:border-0 align-top">
      <td className="px-5 py-3.5">
        <span className="text-ink font-medium">{employee?.first_name} {employee?.last_name}</span>
        <div className="text-xs text-ink/70 font-nums">{employee?.employee_code}</div>
      </td>
      <td className="px-5 py-3.5 text-ink/70">{employee?.location || "—"}</td>
      <td className="px-5 py-3.5 text-ink/70">{MONTH_NAMES[approval.period_month - 1]} {approval.period_year}</td>
      <td className="px-5 py-3.5 font-nums text-ink text-right">{formatINR(approval.net_salary)}</td>
      <td className="px-5 py-3.5">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="w-full rounded-sm border border-ink/15 bg-manila/40 px-2 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
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

export default function PayslipApprovals() {
  const { pendingPayslipApprovals: layoutPending, pendingLoaded } = useOutletContext() || {};
  const hasLayoutData = pendingLoaded && layoutPending !== undefined;
  const [tab, setTab] = useState("pending");
  const [rows, setRows] = useState(() => (hasLayoutData ? layoutPending : []));
  const [loading, setLoading] = useState(!hasLayoutData);
  const skipNextLoad = useRef(hasLayoutData);

  const load = () => {
    setLoading(true);
    api.get("/api/payslip-approvals", { params: { status: tab } }).then(({ data }) => setRows(data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (skipNextLoad.current) {
      skipNextLoad.current = false;
      return;
    }
    load();
  }, [tab]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ink">Payslip Approvals</h2>
        <p className="text-xs text-ink/70 font-nums mt-0.5">HR team's own payslip submissions, awaiting Accounts sign-off</p>
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
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Period</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Net Salary</th>
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Note</th>}
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Action</th>}
              {tab !== "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={6}>Loading ledger…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={6}>No {tab} submissions.</td></tr>
            ) : tab === "pending" ? (
              rows.map((r) => <ResolveRow key={r.id} approval={r} onResolved={load} />)
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.hr_employees?.employee_code}</div>
                  </td>
                  <td className="px-5 py-3.5 text-ink/70">{r.hr_employees?.location || "—"}</td>
                  <td className="px-5 py-3.5 text-ink/70">{MONTH_NAMES[r.period_month - 1]} {r.period_year}</td>
                  <td className="px-5 py-3.5 font-nums text-ink text-right">{formatINR(r.net_salary)}</td>
                  <td className="px-5 py-3.5">
                    <StampBadge status={r.status}>{r.status}</StampBadge>
                    {r.admin_note && <div className="text-xs text-ink/70 mt-1">{r.admin_note}</div>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
