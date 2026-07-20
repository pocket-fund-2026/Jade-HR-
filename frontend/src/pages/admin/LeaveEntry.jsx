import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";
import { LEAVE_LABELS, selectableLeaveTypes } from "../../lib/leaveTypes.js";

const TRANSACTION_TYPES = [
  { value: "credit", label: "Credit" },
  { value: "debit", label: "Debit" },
  { value: "adjustment", label: "Adjustment" },
  { value: "auto_credit", label: "Auto Credit" },
];

const today = () => new Date().toISOString().slice(0, 10);

function EntryForm({ employees, onAdded }) {
  const [employeeId, setEmployeeId] = useState("");
  const [leaveType, setLeaveType] = useState("paid");
  const [transactionType, setTransactionType] = useState("adjustment");
  const [amount, setAmount] = useState("");
  const [remarks, setRemarks] = useState("");
  const [entryDate, setEntryDate] = useState(today());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selectedEmployee = employees.find((e) => e.id === employeeId);
  const isCorporate = selectedEmployee?.employee_category === "corporate";
  const availableTypes = selectableLeaveTypes(isCorporate);

  useEffect(() => {
    if (!availableTypes.includes(leaveType)) setLeaveType("paid");
  }, [employeeId]);

  const submit = async (e) => {
    e.preventDefault();
    if (!employeeId || amount === "") {
      setError("Employee and Leave Credit are required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.post("/api/leave-ledger", {
        employee_id: employeeId,
        leave_type: leaveType,
        transaction_type: transactionType,
        amount: Number(amount),
        remarks,
        entry_date: entryDate,
      });
      setAmount("");
      setRemarks("");
      onAdded();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not add entry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-6 mb-6">
      <p className="font-display text-lg text-ink mb-4">Leave Transaction Entry</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee Name</label>
          <select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            <option value="">Select an employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_code} — {e.first_name} {e.last_name}{!e.is_active ? " (Inactive)" : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Leave Type</label>
          <select
            value={leaveType}
            onChange={(e) => setLeaveType(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            {availableTypes.map((v) => <option key={v} value={v}>{LEAVE_LABELS[v]}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Transaction Type</label>
          <select
            value={transactionType}
            onChange={(e) => setTransactionType(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            {TRANSACTION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Entry Date</label>
          <input
            type="date"
            value={entryDate}
            onChange={(e) => setEntryDate(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Leave Credit</label>
          <input
            type="number" step="0.5"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="e.g. 2.00 or -2.00"
            className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink font-nums focus:outline-none focus:ring-2 focus:ring-jade-500"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Remarks</label>
          <input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          />
        </div>
      </div>
      {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mt-4">{error}</p>}
      <div className="flex justify-end mt-4">
        <button
          disabled={saving}
          className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Adding…" : "Add Entry"}
        </button>
      </div>
    </form>
  );
}

const PAGE_SIZES = [20, 50, 100];

export default function LeaveEntry() {
  const [employees, setEmployees] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("both");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    api.get("/api/employees", { params: { lite: true } }).then(({ data }) => {
      setEmployees([...data].sort((a, b) => (a.is_active === b.is_active ? 0 : a.is_active ? -1 : 1)));
    });
  }, []);

  const load = () => {
    setLoading(true);
    api.get("/api/leave-ledger", {
      params: { status, employee_id: employeeFilter || undefined, page, page_size: pageSize },
    }).then(({ data }) => {
      setRows(data.rows);
      setTotal(data.total);
    }).finally(() => setLoading(false));
  };

  useEffect(load, [status, employeeFilter, page, pageSize]);

  const remove = async (id) => {
    if (!window.confirm("Delete this leave transaction entry?")) return;
    await api.delete(`/api/leave-ledger/${id}`);
    load();
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h2 className="font-display text-2xl text-ink mb-1">Leave Entry</h2>
      <p className="text-sm text-ink/70 mb-6">Manually credit, debit, or adjust an employee's leave balance.</p>

      <EntryForm employees={employees} onAdded={() => { setPage(1); load(); }} />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="font-display text-lg text-ink">Leave Transaction Log</p>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-sm border border-ink/15 overflow-hidden text-xs">
            {["active", "inactive", "both"].map((s) => (
              <button
                key={s}
                onClick={() => { setStatus(s); setPage(1); }}
                className={`px-3 py-1.5 font-semibold capitalize transition-colors ${status === s ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"}`}
              >
                {s}
              </button>
            ))}
          </div>
          <select
            value={employeeFilter}
            onChange={(e) => { setEmployeeFilter(e.target.value); setPage(1); }}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            <option value="">All employees</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.employee_code} — {e.first_name} {e.last_name}</option>
            ))}
          </select>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Emp Code</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Leave Type</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Transaction Type</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Remarks</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Entry Date</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Leave Cr</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={8}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={8}>No entries match.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3 text-ink">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</td>
                  <td className="px-4 py-3 text-ink/70 font-nums">{r.hr_employees?.employee_code}</td>
                  <td className="px-4 py-3 text-ink/70">{LEAVE_LABELS[r.leave_type] || r.leave_type}</td>
                  <td className="px-4 py-3 text-ink/70 capitalize">{r.transaction_type.replace("_", " ")}</td>
                  <td className="px-4 py-3 text-ink/70">{r.remarks || "—"}</td>
                  <td className="px-4 py-3 text-ink/70 font-nums">{formatDate(r.entry_date)}</td>
                  <td className={`px-4 py-3 font-nums font-semibold ${r.amount < 0 ? "text-rust-500" : "text-jade-700"}`}>
                    {r.amount > 0 ? "+" : ""}{Number(r.amount).toFixed(2)}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove(r.id)} aria-label="Delete entry" className="text-ink/50 hover:text-rust-500 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded-sm text-xs font-semibold transition-colors ${p === page ? "bg-ledger-800 text-manila" : "bg-paper border border-ink/15 text-ink/70 hover:border-jade-500"}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
