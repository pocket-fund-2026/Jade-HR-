import { Cake, CalendarDays, Clock3, Pencil, Plus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import api from "../../lib/api.js";
import { daysUntilAnnualDate, formatDate } from "../../lib/format.js";

const DAY_TYPE_LABELS = {
  closed: "Store closed",
  day_off: "Day Off (paid, same as store closed)",
  open_statutory: "Open (statutory pay)",
  open_till_4pm: "Open till a set time",
  open_normal: "Open (no special pay)",
  anniversary: "Anniversary (informational only)",
};

const LOCATION_OPTIONS = [
  { value: "", label: "All Locations" },
  { value: "Mumbai", label: "Mumbai" },
  { value: "Delhi", label: "Delhi" },
  { value: "Ahmedabad", label: "Ahmedabad" },
  { value: "HQ", label: "HQ (Madhu Estate only)" },
];

const today = new Date();
const YEAR_OPTIONS = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1, today.getFullYear() + 2];

function HolidayCalendar({ holidays, onAdd, onRemove, adding, year, onYearChange, locationFilter, onLocationFilterChange }) {
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");
  const [dayType, setDayType] = useState("closed");
  const [location, setLocation] = useState("");
  const [closeTime, setCloseTime] = useState("16:00");
  const [remarks, setRemarks] = useState("");
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await onAdd({
        holiday_date: date,
        description,
        day_type: dayType,
        remarks,
        location: location || null,
        close_time: dayType === "open_till_4pm" ? closeTime : null,
      });
      setDate(""); setDescription(""); setRemarks(""); setDayType("closed"); setLocation(""); setCloseTime("16:00");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not add — try again");
    }
  };

  return (
    <div>
      <p className="text-sm text-ink/70 mb-4">
        Company holiday calendar for corporate staff, editable per store. Leave Location as "All Locations" for a
        holiday that applies everywhere; pick a city or "HQ" (Madhu Estate specifically) to scope it to just that
        store. A "Store closed" day is paid like a weekly off instead of showing absent — "Anniversary" entries are
        informational only and never affect attendance or pay.
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
          <label htmlFor="holiday_location" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Location</label>
          <select id="holiday_location" value={location} onChange={(e) => setLocation(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
            {LOCATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="holiday_type" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Type</label>
          <select id="holiday_type" value={dayType} onChange={(e) => setDayType(e.target.value)}
            className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
            {Object.entries(DAY_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        {dayType === "open_till_4pm" && (
          <div>
            <label htmlFor="holiday_close_time" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Closing Time</label>
            <input id="holiday_close_time" type="time" value={closeTime} onChange={(e) => setCloseTime(e.target.value)}
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
          </div>
        )}
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

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <select value={year} onChange={(e) => onYearChange(Number(e.target.value))}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
          {YEAR_OPTIONS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={locationFilter} onChange={(e) => onLocationFilterChange(e.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-jade-500">
          <option value="">All Locations</option>
          {LOCATION_OPTIONS.filter((o) => o.value).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="bg-paper rounded-sm shadow-card divide-y divide-ink/[0.06]">
        {holidays.length === 0 ? (
          <p className="px-5 py-8 text-ink/70 text-center text-sm">No holidays recorded for this filter.</p>
        ) : (
          holidays.map((h) => (
            <div key={h.id} className="flex items-center justify-between gap-4 px-5 py-3.5">
              <div>
                <p className="text-sm text-ink font-medium">
                  {h.description}
                  {h.location && (
                    <span className="ml-2 text-[10px] font-semibold uppercase tracking-wider text-jade-700 bg-jade-500/15 rounded-full px-2 py-0.5 align-middle">
                      {h.location}
                    </span>
                  )}
                </p>
                <p className="text-xs text-ink/70 mt-0.5">
                  {formatDate(h.holiday_date)} · {DAY_TYPE_LABELS[h.day_type] || h.day_type}
                  {h.close_time && ` (${h.close_time.slice(0, 5)})`}
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

function BirthdayRow({ b, onSave }) {
  const [editing, setEditing] = useState(false);
  const [dob, setDob] = useState(b.date_of_birth || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await onSave(b.employee_id, dob);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const days = b.date_of_birth ? daysUntilAnnualDate(b.date_of_birth) : null;

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div>
        <p className="text-sm text-ink font-medium">{b.name}</p>
        <p className="text-xs text-ink/70 mt-0.5">
          {b.employee_code}{b.department && ` · ${b.department}`}
          {b.date_of_birth && ` · ${formatDate(b.date_of_birth)}`}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {editing ? (
          <>
            <input type="date" value={dob} onChange={(e) => setDob(e.target.value)}
              className="rounded-sm border border-ink/15 bg-manila/40 px-2 py-1.5 text-xs font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500" />
            <button onClick={save} disabled={saving || !dob} className="text-xs font-semibold text-jade-600 hover:underline disabled:opacity-50">Save</button>
            <button onClick={() => setEditing(false)} aria-label="Cancel" className="text-ink/40 hover:text-ink">
              <X size={14} />
            </button>
          </>
        ) : (
          <>
            {days !== null && (
              <span className={`flex items-center gap-1 text-xs font-semibold uppercase tracking-wide ${days === 0 ? "text-jade-600" : "text-ink/70"}`}>
                {days === 0 && <Cake size={12} />}
                {days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `in ${days} days`}
              </span>
            )}
            <button onClick={() => setEditing(true)} aria-label="Edit birthday" className="text-ink/40 hover:text-jade-600">
              <Pencil size={14} />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Birthdays() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/api/employees/birthdays").then(({ data }) => setRows(data.filter((r) => r.is_active))).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const saveDob = async (employeeId, dob) => {
    await api.put(`/api/employees/${employeeId}/profile`, { date_of_birth: dob });
    load();
  };

  const withDob = useMemo(
    () => [...rows].filter((r) => r.date_of_birth).sort((a, b) => daysUntilAnnualDate(a.date_of_birth) - daysUntilAnnualDate(b.date_of_birth)),
    [rows],
  );
  const missingDob = useMemo(
    () => [...rows].filter((r) => !r.date_of_birth).sort((a, b) => a.name.localeCompare(b.name)),
    [rows],
  );

  if (loading) return <p className="text-ink/70 text-sm">Loading…</p>;

  return (
    <div>
      <p className="text-sm text-ink/70 mb-4">
        Upcoming birthdays for the HQ team (Madhu Estate, Mumbai), soonest first. Click the pencil to add or correct
        anyone's date of birth — this is the same field shown on their Employee Details page.
      </p>
      <div className="bg-paper rounded-sm shadow-card divide-y divide-ink/[0.06] mb-6">
        {withDob.length === 0 ? (
          <p className="px-5 py-8 text-ink/70 text-center text-sm">No birthdays on file yet.</p>
        ) : (
          withDob.map((b) => <BirthdayRow key={b.employee_id} b={b} onSave={saveDob} />)
        )}
      </div>

      {missingDob.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-2">Missing date of birth ({missingDob.length})</p>
          <div className="bg-paper rounded-sm shadow-card divide-y divide-ink/[0.06]">
            {missingDob.map((b) => <BirthdayRow key={b.employee_id} b={b} onSave={saveDob} />)}
          </div>
        </>
      )}
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
  const [year, setYear] = useState(today.getFullYear());
  const [locationFilter, setLocationFilter] = useState("");

  const loadHolidays = (y = year, loc = locationFilter) =>
    api.get("/api/holidays", { params: { year: y, location: loc || undefined } }).then(({ data }) => setHolidays(data));

  useEffect(() => {
    Promise.all([
      loadHolidays(),
      api.get("/api/employees").then(({ data }) => setEmployees(data)),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadHolidays(year, locationFilter); }, [year, locationFilter]);

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
        <button onClick={() => setTab("birthdays")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm font-medium transition-colors ${tab === "birthdays" ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"}`}>
          <Cake size={14} /> Birthdays
        </button>
      </div>

      {loading ? (
        <p className="text-ink/70 text-sm">Loading…</p>
      ) : tab === "holidays" ? (
        <HolidayCalendar
          holidays={holidays} onAdd={addHoliday} onRemove={removeHoliday} adding={adding}
          year={year} onYearChange={setYear} locationFilter={locationFilter} onLocationFilterChange={setLocationFilter}
        />
      ) : tab === "compoff" ? (
        <CompOffGrant corporateEmployees={corporateEmployees} />
      ) : (
        <Birthdays />
      )}
    </div>
  );
}
