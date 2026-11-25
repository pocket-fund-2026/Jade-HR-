import { ArrowLeft, Check, FileSpreadsheet, Plus, Search, Ban } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import AddArrearModal, { ARREAR_REASONS, MONTHS } from "../../../components/AddArrearModal.jsx";
import api from "../../../lib/api.js";
import { useAuth } from "../../../lib/auth.jsx";
import { formatFullDate, formatINR } from "../../../lib/format.js";

import EmptyState from "../../../components/EmptyState.jsx";
const STATUS_STYLE = {
  pending: "bg-ochre-500/15 text-ochre-700",
  approved: "bg-jade-500/15 text-jade-700",
  cancelled: "bg-ink/10 text-ink/60 line-through",
};
const th = "px-4 py-3 font-semibold text-[11px] text-ink/70";
const sel = "rounded-sm border border-ink/15 bg-manila/40 px-4 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

async function exportExcel(rows) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => ({
    "Employee Code": r.employee_code,
    "Name": r.name,
    "Location": r.location,
    "Pay Month": `${MONTHS[r.pay_month - 1]} ${r.pay_year}`,
    "Reason": ARREAR_REASONS[r.reason] || r.reason,
    "Relates From": r.period_from || "",
    "Relates To": r.period_to || "",
    "Arrear Amount": r.arrear_amount,
    "TDS": r.tds_amount,
    "Net Payable": r.net_effect,
    "Status": r.status,
    "Remarks": r.remarks,
    "Entered By": r.created_by_name,
    "Approved By": r.approved_by_name,
    "Approved At": r.approved_at ? r.approved_at.slice(0, 10) : "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Arrears");
  XLSX.writeFile(wb, `jade-hr-arrears-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function ArrearDetailsReport() {
  const { can } = useAuth();
  const canEdit = can("salary.edit");
  const [payYear, setPayYear] = useState("");
  const [payMonth, setPayMonth] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api.get("/api/arrears", { params: { pay_year: payYear || undefined, pay_month: payMonth || undefined, status: status || undefined } })
      .then(({ data }) => setRows(data))
      .catch(() => setError("Could not load arrears"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [payYear, payMonth, status]);
  useEffect(() => {
    api.get("/api/employees", { params: { lite: true } }).then(({ data }) => setEmployees(data)).catch(() => {});
  }, []);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => `${r.name} ${r.employee_code}`.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const sum = (st) => shown.filter((r) => r.status === st).reduce((s, r) => s + r.net_effect, 0);
  const count = (st) => shown.filter((r) => r.status === st).length;

  const act = async (r, action) => {
    setError("");
    let body = {};
    if (action === "cancel") {
      const reason = window.prompt(`Cancel the ${formatINR(r.arrear_amount)} arrear for ${r.name}? Reason (optional):`);
      if (reason === null) return;
      body = { reason };
    }
    try {
      await api.post(`/api/arrears/${r.id}/${action}`, body);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Action failed");
    }
  };

  const years = [new Date().getFullYear() - 1, new Date().getFullYear(), new Date().getFullYear() + 1];

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mt-2 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Arrears</h2>
          <p className="text-xs text-ink/70 mt-1 max-w-xl">
            Only <b>approved</b> arrears are paid — in the chosen pay month’s payroll (net pay, payslip, bank transfer). Pending ones wait for approval.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {canEdit && (
            <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-ledger-800 text-on-jade px-[1.5em] py-[0.625em] leading-tight rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors">
              <Plus size={15} /> Add arrear
            </button>
          )}
          <button onClick={() => exportExcel(shown)} disabled={!shown.length} className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-[1.5em] py-[0.625em] leading-tight rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors">
            <FileSpreadsheet size={15} /> Export Excel
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <label className="flex items-center gap-2 bg-paper rounded-sm shadow-card px-3 py-2 text-xs text-ink/70 font-medium">
          Pay month
          <select value={payMonth} onChange={(e) => setPayMonth(e.target.value)} className={sel}>
            <option value="">All</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
          <select value={payYear} onChange={(e) => setPayYear(e.target.value)} className={sel}>
            <option value="">All years</option>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 bg-paper rounded-sm shadow-card px-3 py-2 text-xs text-ink/70 font-medium">
          Status
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="flex items-center gap-2 bg-paper rounded-sm shadow-card px-3 py-2">
          <Search size={14} className="text-ink/50" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or code…" className="bg-transparent text-sm focus:outline-none" />
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-ledger-800 rounded-sm shadow-card p-5 relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
          <p className="relative text-on-jade/80 text-xs">Approved — payable ({count("approved")})</p>
          <p className="relative font-nums font-semibold text-3xl text-on-jade">{formatINR(sum("approved"))}</p>
        </div>
        <div className="bg-paper rounded-sm shadow-card p-5 border-l-4 border-ochre-500">
          <p className="text-ink/70 text-xs">Pending approval ({count("pending")})</p>
          <p className="font-nums font-semibold text-3xl text-ink">{formatINR(sum("pending"))}</p>
        </div>
      </div>

      {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mb-3">{error}</p>}

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left sticky top-0 z-10 bg-paper shadow-edge">
            <tr className="border-b-2 border-ink/10">
              <th className={th}>Employee</th>
              <th className={th}>Pay month</th>
              <th className={th}>Reason</th>
              <th className={`${th} text-right`}>Arrear</th>
              <th className={`${th} text-right`}><abbr className="acr">TDS</abbr></th>
              <th className={`${th} text-right`}>Net</th>
              <th className={th}>Status</th>
              <th className={th}>Audit</th>
              {canEdit && <th className={th}></th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={9}>Loading…</td></tr>
            ) : shown.length === 0 ? (
              <tr><td colSpan={9}><EmptyState title="No arrears match these filters" action={{ label: "Clear filters", onClick: () => { setPayYear(""); setPayMonth(""); setStatus(""); setSearch(""); } }}>Try a different month, status or name.</EmptyState></td></tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors align-top">
                  <td className="px-4 py-3">
                    <span className="text-ink font-medium">{r.name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code} · {r.location}</div>
                  </td>
                  <td className="px-4 py-3 font-nums">{MONTHS[r.pay_month - 1]} {r.pay_year}</td>
                  <td className="px-4 py-3">
                    {ARREAR_REASONS[r.reason] || r.reason}
                    {r.period_from && <div className="text-xs text-ink/60">for {formatFullDate(r.period_from)}{r.period_to ? ` – ${formatFullDate(r.period_to)}` : ""}</div>}
                    {r.remarks && <div className="text-xs text-ink/60">{r.remarks}</div>}
                  </td>
                  <td className="px-4 py-3 text-right font-nums font-semibold">{formatINR(r.arrear_amount)}</td>
                  <td className="px-4 py-3 text-right font-nums text-ink/70">{r.tds_amount ? formatINR(r.tds_amount) : "—"}</td>
                  <td className="px-4 py-3 text-right font-nums font-semibold text-jade-700">{formatINR(r.net_effect)}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-sm text-xs font-semibold capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-ink/60">
                    {r.created_by_name && <div>Entered: {r.created_by_name}</div>}
                    {r.approved_by_name && <div>Approved: {r.approved_by_name}</div>}
                    {r.cancelled_by_name && <div>Cancelled: {r.cancelled_by_name}{r.cancel_reason ? ` — ${r.cancel_reason}` : ""}</div>}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.status === "pending" && (
                        <button onClick={() => act(r, "approve")} className="inline-flex items-center gap-1 text-jade-700 hover:underline text-xs font-semibold mr-8"><Check size={13} /> Approve arrear</button>
                      )}
                      {r.status !== "cancelled" && (
                        <button onClick={() => act(r, "cancel")} className="inline-flex items-center gap-1 text-rust-500 hover:underline text-xs font-semibold"><Ban size={13} /> Cancel arrear</button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <AddArrearModal employees={employees} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}
    </div>
  );
}
