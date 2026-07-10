import { CalendarDays, Clock3, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const DAY_TYPE_LABELS = {
  closed: "Store closed",
  open_statutory: "Open (statutory pay)",
  open_till_4pm: "Open till 4pm",
};

function HolidayCalendar({ holidays, onAdd, onRemove, adding }) {
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [dayType, setDayType] = useState("closed");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onAdd({ holiday_date: date, description, day_type: dayType, remarks });
      setDate(""); setDescription(""); setRemarks(""); setDayType("closed");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not add — try again");
    }
  };

  return (
    <div>
      <p className="text-sm text-ink/70 mb-4">
        Company holiday calendar for corporate staff. A "Store closed" day is paid like a weekly off instead of
        showing absent — the other two are for reference only.
      </p>

      <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="holiday_date" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Date</label>
          <input id="holiday_date" type="date" required value={date} onChange={(e) => setDate(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
        </div>
        <div>
          <label htmlFor="holiday_desc" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Description</label>
          <input id="holiday_desc" type="text" required value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Diwali"
            className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
        </div>
        <div>
          <label htmlFor="holiday_type" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Type</label>
          <select id="holiday_type" value={dayType} onChange={(e) => setDayType(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
            {Object.entries(DAY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="holiday_remarks" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Remarks</label>
          <input id="holiday_remarks" type="text" value={remarks} onChange={(e) => setRemarks(e.target.value)}
            placeholder="Optional"
            className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
        </div>
        {error && <p className="sm:col-span-2 text-sm text-rust-500">{error}</p>}
        <div className="sm:col-span-2">
          <button type="submit" disabled={adding}
            className="flex items-center gap-1.5 bg-jade-600 text-white px-4 py-2 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors">
            <Plus size={14} /> Add holiday
          </button>
        </div>
      </form>

      <div className="bg-paper rounded-sm shadow-card divide-y divide-ink/[0.06]">
        {holidays.length === 0 ? (
          <p className="px-5 py-8 text-ink/70 text-center text-sm">No holidays recorded yet.</p>
        ) : (
          holidays.map((h) => (
            <div key={h.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div>
                <p className="text-sm text-ink font-medium">{h.description}</p>
                <p className="text-xs text-ink/70 mt-0.5">
                  {formatDate(h.holiday_date)} · {DAY_TYPE_LABELS[h.day_type]}
                  {h.remarks && ` · ${h.remarks}`}
                </p>
              </div>
              <button type="button" onClick={() => onRemove(h.id)} aria-label="Remove holiday" className="text-ink/40 hover:text-rust-500 p-1">
                <X size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CompOffGrant({ corporateEmployees }) {
  const [employeeId, setEmployeeId] = useState("");
  const [earnedDate, setEarnedDate] = useState("");
  const [units, setUnits] = useState("1.0");
  const [ledger, setLedger] = useState([]);
  const [error, setError] = useState("");
  const [granting, setGranting] = useState(false);

  const loadLedger = (id) => {
    if (!id) { setLedger([]); return; }
    api.get(`/api/comp-off/${id}`).then(({ data }) => setLedger(data));
  };

  useEffect(() => { loadLedger(employeeId); }, [employeeId]);

  const grant = async (e) => {
    e.preventDefault();
    setError("");
    setGranting(true);
    try {
      await api.post("/api/comp-off/grant", { employee_id: employeeId, earned_date: earnedDate, units: parseFloat(units) });
      setEarnedDate("");
      loadLedger(employeeId);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not grant — try again");
    } finally {
      setGranting(false);
    }
  };

  return (
    <div>
      <p className="text-sm text-ink/70 mb-4">
        Comp-Off is earned only when a corporate employee works a weekly off or a declared holiday — grant it
        manually once you've validated it (biometric log, Zoho form, HOD confirmation). Each grant is valid 120
        days from the earned date; a leave request can club at most 2 days.
      </p>

      <form onSubmit={grant} className="bg-paper rounded-sm shadow-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="co_employee" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee</label>
          <select id="co_employee" required value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
            <option value="">Select…</option>
            {corporateEmployees.map((e) => (
              <option key={e.id} value={e.id}>{e.name} ({e.employee_code})</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="co_date" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Date worked</label>
          <input id="co_date" type="date" required value={earnedDate} onChange={(e) => setEarnedDate(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
        </div>
        <div>
          <label htmlFor="co_units" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Units</label>
          <select id="co_units" value={units} onChange={(e) => setUnits(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
            <option value="0.5">½ day (worked ≤ 4 hours)</option>
            <option value="1.0">Full day (worked &gt; 4 hours)</option>
          </select>
        </div>
        {error && <p className="sm:col-span-2 text-sm text-rust-500">{error}</p>}
        <div className="sm:col-span-2">
          <button type="submit" disabled={granting || !employeeId}
            className="flex items-center gap-1.5 bg-jade-600 text-white px-4 py-2 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors">
            <Plus size={14} /> Grant Comp-Off
          </button>
        </div>
      </form>

      {employeeId && (
        <div className="bg-paper rounded-sm shadow-card divide-y divide-ink/[0.06]">
          {ledger.length === 0 ? (
            <p className="px-5 py-8 text-ink/70 text-center text-sm">No Comp-Off history for this employee.</p>
          ) : (
            ledger.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div>
                  <p className="text-sm text-ink">{l.units} day earned {formatDate(l.earned_date)}</p>
                  <p className="text-xs text-ink/70 mt-0.5">Expires {formatDate(l.expiry_date)}</p>
                </div>
                <span className={`text-xs font-semibold uppercase tracking-wide ${
                  l.status === "available" ? "text-jade-600" : l.status === "used" ? "text-ink/50" : "text-rust-500"
                }`}>
                  {l.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function Policy() {
  const [tab, setTab] = useState("holidays");
  const [holidays, setHolidays] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  const loadHolidays = () => api.get("/api/holidays").then(({ data }) => setHolidays(data));

  useEffect(() => {
    Promise.all([
      loadHolidays(),
      api.get("/api/employees").then(({ data }) => setEmployees(data)),
    ]).finally(() => setLoading(false));
  }, []);

  const corporateEmployees = useMemo(
    () =>
      employees
        .filter((e) => e.employee_category === "corporate" && e.is_active)
        .map((e) => ({ id: e.id, employee_code: e.employee_code, name: `${e.first_name} ${e.last_name || ""}`.trim() }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [employees],
  );

  const addHoliday = async (body) => {
    setAdding(true);
    try {
      await api.post("/api/holidays", body);
      await loadHolidays();
    } finally {
      setAdding(false);
    }
  };

  const removeHoliday = async (id) => {
    await api.delete(`/api/holidays/${id}`);
    loadHolidays();
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <CalendarDays size={20} className="text-jade-600" />
        <h2 className="font-display text-2xl text-ink">Leave Policy</h2>
      </div>
      <p className="text-sm text-ink/70 mb-6">
        Corporate Leave &amp; Attendance Policy v1.1 — holiday calendar and Comp-Off. Applies to corporate roster
        staff only; factory, warehouse and retail attendance is unaffected.
      </p>

      <div className="flex gap-1 mb-6">
        <button onClick={() => setTab("holidays")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm font-medium transition-colors ${tab === "holidays" ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"}`}>
          <CalendarDays size={14} /> Holiday Calendar
        </button>
        <button onClick={() => setTab("compoff")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm font-medium transition-colors ${tab === "compoff" ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"}`}>
          <Clock3 size={14} /> Comp-Off
        </button>
      </div>

      {loading ? (
        <p className="text-ink/70 text-sm">Loading…</p>
      ) : tab === "holidays" ? (
        <HolidayCalendar holidays={holidays} onAdd={addHoliday} onRemove={removeHoliday} adding={adding} />
      ) : (
        <CompOffGrant corporateEmployees={corporateEmployees} />
      )}
    </div>
  );
}
