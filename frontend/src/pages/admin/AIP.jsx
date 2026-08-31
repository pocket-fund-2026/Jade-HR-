import { ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const TABS = [
  { key: "active", label: "Active" },
  { key: "passed", label: "Passed" },
  { key: "failed", label: "Failed" },
];

function daysRemaining(endDate) {
  const diff = Math.ceil((new Date(endDate) - new Date()) / 86400000);
  return diff;
}

function StartAipForm({ onStarted }) {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [duration, setDuration] = useState(30);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/employees", { params: { lite: true } }).then(({ data }) => setEmployees(data));
  }, []);

  const corporateEmployees = useMemo(
    () => employees.filter((e) => e.employee_category === "corporate" && e.is_active)
      .sort((a, b) => a.first_name.localeCompare(b.first_name)),
    [employees],
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!employeeId) return;
    setError("");
    setBusy(true);
    try {
      await api.post("/api/late-policy/v3/aip", {
        employee_id: employeeId, duration_days: Number(duration), start_date: startDate, notes,
      });
      setEmployeeId(""); setNotes("");
      onStarted();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not start AIP — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-5 mb-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-4">Start an Attendance Improvement Plan</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee</label>
          <select
            value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            <option value="">Select employee…</option>
            {corporateEmployees.map((e) => (
              <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code})</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Duration</label>
          <select
            value={duration} onChange={(e) => setDuration(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Start Date</label>
          <input
            type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          />
        </div>
      </div>
      <div className="mt-4">
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Notes (optional)</label>
        <input
          value={notes} onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
        />
      </div>
      {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mt-3">{error}</p>}
      <div className="flex justify-end mt-4">
        <button
          type="submit" disabled={busy || !employeeId}
          className="flex items-center gap-1.5 bg-ochre-600 text-white px-4 py-2.5 rounded-sm text-sm font-semibold hover:bg-ochre-700 disabled:opacity-50 transition-colors"
        >
          <ShieldAlert size={15} /> {busy ? "Starting…" : "Start AIP"}
        </button>
      </div>
    </form>
  );
}

function CloseAipRow({ aip, onClosed }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const remaining = daysRemaining(aip.end_date);
  const employee = aip.hr_employees;

  const close = async (status) => {
    setBusy(true);
    try {
      await api.post(`/api/late-policy/v3/aip/${aip.id}/close`, { status, notes });
      onClosed();
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
      <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(aip.start_date)}–{formatDate(aip.end_date)}</td>
      <td className="px-5 py-3.5 font-nums text-ink/70">{aip.duration_days} days</td>
      <td className="px-5 py-3.5 font-nums text-ink/70">
        {remaining >= 0 ? `${remaining} day${remaining === 1 ? "" : "s"} left` : `${-remaining} day${-remaining === 1 ? "" : "s"} overdue`}
      </td>
      <td className="px-5 py-3.5 max-w-xs text-ink/70">{aip.notes}</td>
      <td className="px-5 py-3.5">
        <input
          value={notes} onChange={(e) => setNotes(e.target.value)}
          aria-label="Close note (optional)" placeholder="Close note (optional)"
          className="w-36 rounded-sm border border-ink/15 bg-manila/40 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-jade-500"
        />
      </td>
      <td className="px-5 py-3.5">
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => close("passed")}
            className="bg-jade-600 text-white px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors"
          >
            Passed
          </button>
          <button
            disabled={busy}
            onClick={() => close("failed")}
            className="bg-paper border border-rust-500 text-rust-500 px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-rust-50 disabled:opacity-50 transition-colors"
          >
            Failed
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function AIP() {
  const [tab, setTab] = useState("active");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/api/late-policy/v3/aip", { params: { status: tab } }).then(({ data }) => setRecords(data)).finally(() => setLoading(false));
  };

  useEffect(load, [tab]);

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ink">Attendance Improvement Plans</h2>
        <p className="text-xs text-ink/70 font-nums mt-0.5">Doc §15 — 30/60-day plan after a Red Card (7 Yellow Cards in a cycle); only 1 late arrival tolerated for the duration</p>
      </div>

      {tab === "active" && <StartAipForm onStarted={load} />}

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
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Dates</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Duration</th>
              {tab === "active" ? (
                <>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Time Left</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Notes</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Close note</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Action</th>
                </>
              ) : (
                <>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Notes</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={7}>Loading ledger…</td></tr>
            ) : records.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={7}>No {tab} AIPs.</td></tr>
            ) : tab === "active" ? (
              records.map((a) => <CloseAipRow key={a.id} aip={a} onClosed={load} />)
            ) : (
              records.map((a) => (
                <tr key={a.id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{a.hr_employees?.first_name} {a.hr_employees?.last_name}</span>
                    <div className="text-xs text-ink/70 font-nums">{a.hr_employees?.employee_code}</div>
                  </td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(a.start_date)}–{formatDate(a.end_date)}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{a.duration_days} days</td>
                  <td className="px-5 py-3.5"><StampBadge status={a.status}>{a.status}</StampBadge></td>
                  <td className="px-5 py-3.5 text-ink/70">{a.notes}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
