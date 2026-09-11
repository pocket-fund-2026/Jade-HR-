import { CalendarClock, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const TABS = [
  { key: "available", label: "Available" },
  { key: "used", label: "Used" },
  { key: "expired", label: "Expired" },
  { key: "", label: "All" },
];

const inputCls =
  "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

// HR granting a day the punch data can't see by itself — a holiday worked
// from home, an HOD-confirmed day, a correction. Days that ARE visible in
// the punches (weekly off / declared holiday worked, or work past 12:30 AM)
// are credited automatically by the nightly accrual, so this is the
// exception path, not the main one.
function GrantForm({ onGranted, onCancel }) {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [earnedDate, setEarnedDate] = useState("");
  const [units, setUnits] = useState("1.0");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/employees", { params: { lite: true } }).then(({ data }) => {
      setEmployees(
        data.filter((e) => e.is_active)
          .sort((a, b) => `${a.first_name} ${a.last_name || ""}`.localeCompare(`${b.first_name} ${b.last_name || ""}`)),
      );
    }).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/api/comp-off/grant", {
        employee_id: employeeId, earned_date: earnedDate, units: Number(units),
      });
      onGranted();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not grant — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-5 mb-5 space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-jade-600">Grant a Comp-Off</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee</label>
          <select required className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
            <option value="">Select an employee…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>{e.employee_code} — {e.first_name} {e.last_name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Day worked</label>
          <input type="date" required className={`${inputCls} font-nums`} value={earnedDate} onChange={(e) => setEarnedDate(e.target.value)} />
        </div>
      </div>
      <div className="sm:w-40">
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Units</label>
        <select className={inputCls} value={units} onChange={(e) => setUnits(e.target.value)}>
          <option value="1.0">1 full day</option>
          <option value="0.5">½ day (under 4h)</option>
        </select>
      </div>
      <p className="text-xs text-ink/70">
        Valid 120 days from the day worked. Days already visible in the biometric punches are credited
        automatically each night — use this for the ones that aren't.
      </p>
      {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="text-sm text-ink/70 hover:text-ink px-2">Cancel</button>
        <button
          type="submit"
          disabled={busy || !employeeId || !earnedDate}
          className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
        >
          {busy ? "Granting…" : "Grant Comp-Off"}
        </button>
      </div>
    </form>
  );
}

export default function CompOff() {
  const [tab, setTab] = useState("available");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGrant, setShowGrant] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/api/comp-off/ledger/all", { params: tab ? { status: tab } : {} })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [tab]);

  const totalDays = rows
    .filter((r) => r.effective_status === "available")
    .reduce((sum, r) => sum + Number(r.units), 0);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <CalendarClock size={20} className="text-jade-600" />
          <h2 className="font-display text-2xl text-ink">Comp-Off</h2>
        </div>
        <button
          onClick={() => setShowGrant((v) => !v)}
          className="flex items-center gap-1.5 bg-ledger-800 text-manila px-4 py-2 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
        >
          <Plus size={15} /> Grant Comp-Off
        </button>
      </div>
      <p className="text-sm text-ink/70 mb-5">
        Earned by working a weekly off or declared holiday, or by working past 12:30 AM — credited automatically
        each night from the biometric punches. Employees spend it by requesting leave of type "Comp-Off", which
        notifies their reporting manager and HR like any other leave.
      </p>

      {showGrant && <GrantForm onGranted={() => { setShowGrant(false); load(); }} onCancel={() => setShowGrant(false)} />}

      <div className="flex flex-wrap items-center gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key || "all"}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
              tab === t.key ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
        {tab === "available" && rows.length > 0 && (
          <span className="text-xs text-ink/70 ml-auto font-nums">
            {totalDays} day(s) outstanding across {new Set(rows.map((r) => r.employee_id)).size} employee(s)
          </span>
        )}
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Day worked</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Units</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Expires</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={5}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-ink/70 text-center" colSpan={5}>
                  No {tab || "comp-off"} entries. Credits appear here after the nightly accrual, or immediately
                  when granted above.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    <Link to={`/admin/employees/${r.employee_id}`} className="text-ink font-medium hover:text-jade-600 transition-colors">
                      {r.name}
                    </Link>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code} · {r.department || "—"}</div>
                  </td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(r.earned_date)}</td>
                  <td className="px-5 py-3.5 font-nums text-ink">{r.units}d</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">
                    {formatDate(r.expiry_date)}
                    {r.effective_status === "available" && r.days_to_expiry <= 30 && (
                      <span className="ml-1.5 text-xs font-semibold text-ochre-700">{r.days_to_expiry}d left</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <StampBadge status={
                      r.effective_status === "available" ? "approved" : r.effective_status === "used" ? "leave" : "inactive"
                    }>
                      {r.effective_status}
                    </StampBadge>
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
