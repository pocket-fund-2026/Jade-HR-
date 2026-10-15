import { CalendarClock, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import CompOffPolicy from "../../components/CompOffPolicy.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatFullDate as formatDate } from "../../lib/format.js";
import SlidingTabs from "../../components/SlidingTabs.jsx";

const TABS = [
  { key: "available", label: "Available" },
  { key: "used", label: "Used" },
  { key: "expired", label: "Expired" },
  { key: "", label: "All" },
];

const inputCls =
  "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

function istToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
function expiryFor(value) {
  if (!value) return "";
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 120);
  return d.toISOString().slice(0, 10);
}
const optionsFor = (rows, key) => [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();
function FilterSelect({ label, value, onChange, options, allLabel }) {
  return <label className="block text-xs text-ink/70 space-y-1.5">
    <span className="font-semibold">{label}</span>
    <select aria-label={label} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{allLabel}</option>
      {options.map((v) => <option key={v} value={v}>{v}</option>)}
    </select>
  </label>;
}

function GrantForm({ onGranted, onCancel }) {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [earnedDate, setEarnedDate] = useState("");
  const [hours, setHours] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const units = Number(hours) > 4 ? 1 : 0.5;
  const expiry = expiryFor(earnedDate);
  const loadEmployees = () => {
    setLoading(true);
    setLoadError("");
    api.get("/api/comp-off/employees").then(({ data }) => {
      setEmployees(data.filter((e) => e.is_active).sort((a, b) =>
        `${a.first_name} ${a.last_name || ""}`.localeCompare(`${b.first_name} ${b.last_name || ""}`)));
    }).catch(() => setLoadError("Could not load employees. Please retry."))
      .finally(() => setLoading(false));
  };
  useEffect(loadEmployees, []);
  const filtered = employees.filter((e) => (!department || e.department === department) &&
    (!location || e.location === location) &&
    `${e.employee_code} ${e.first_name} ${e.last_name || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const filterChange = (setter) => (value) => { setter(value); setEmployeeId(""); setConfirmed(false); };
  const selected = employees.find((e) => e.id === employeeId);
  const submit = async (e) => {
    e.preventDefault();
    if (busy || !selected || !confirmed || Number(hours) <= 0) return;
    setError("");
    setBusy(true);
    try {
      await api.post("/api/comp-off/grant", {
        employee_id: employeeId, earned_date: earnedDate, units, hours_worked: Number(hours),
      });
      onGranted(`${units === 0.5 ? "½" : "1"} day granted to ${selected.first_name} ${selected.last_name || ""}. Expires ${formatDate(expiry)}.`);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not grant Comp-Off. Please try again.");
    } finally { setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-5 mb-5 space-y-4 border-t-2 border-jade-500">
      <div>
        <h3 className="font-display text-xl text-ink">Grant Comp-Off</h3>
        <p className="text-sm text-ink/70 mt-1">Find an employee, confirm the day worked and review the credit before granting.</p>
      </div>
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
        <legend className="text-xs font-semibold text-jade-600 mb-3">1. Find an active employee</legend>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block text-xs text-ink/70 space-y-1.5"><span className="font-semibold">Search name or code</span>
            <input type="search" className={inputCls} placeholder="Name or employee code" value={search} onChange={(e) => filterChange(setSearch)(e.target.value)} />
          </label>
          <FilterSelect label="Department" allLabel="All departments" value={department} onChange={filterChange(setDepartment)} options={optionsFor(employees, "department")} />
          <FilterSelect label="Location" allLabel="All locations" value={location} onChange={filterChange(setLocation)} options={optionsFor(employees, "location")} />
        </div>
        <label className="block text-xs text-ink/70 space-y-1.5"><span className="font-semibold">Employee · {filtered.length} matching</span>
          <select aria-label="Employee" required disabled={loading || !!loadError || !filtered.length} className={inputCls} value={employeeId} onChange={(e) => { setEmployeeId(e.target.value); setConfirmed(false); }}>
            <option value="">{loading ? "Loading employees…" : filtered.length ? "Choose an employee" : "No employees match — adjust filters"}</option>
            {filtered.map((e) => <option key={e.id} value={e.id}>{e.first_name} {e.last_name || ""} · {e.employee_code} · {e.department || "No department"} · {e.location || "No location"}</option>)}
          </select>
        </label>
        {loadError && <p role="alert" className="text-sm text-rust-500">{loadError} <button type="button" onClick={loadEmployees} className="underline">Retry</button></p>}
      </fieldset>
      <fieldset disabled={busy} className="space-y-4 disabled:opacity-70">
        <legend className="text-xs font-semibold text-jade-600 mb-3">2. Confirm the work</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block text-xs text-ink/70 space-y-1.5"><span className="font-semibold">Day worked</span>
            <input type="date" required max={istToday()} className={inputCls} value={earnedDate} onChange={(e) => { setEarnedDate(e.target.value); setConfirmed(false); }} />
          </label>
          <label className="block text-xs text-ink/70 space-y-1.5"><span className="font-semibold">Hours worked</span>
            <input type="number" required min="0.01" max="24" step="0.01" placeholder="e.g. 4" className={inputCls} value={hours} onChange={(e) => { setHours(e.target.value); setConfirmed(false); }} />
          </label>
        </div>
        <p className="text-xs text-ink/70">Up to and including 4 hours earns ½ day; above 4 hours earns 1 full day. The date must be a declared public holiday or this employee’s weekly off.</p>
        <div aria-live="polite" className="bg-manila/60 rounded-sm px-4 py-3 text-sm text-ink">
          <span className="font-semibold">Credit: {Number(hours) > 0 ? `${units === 0.5 ? "½" : "1 full"} day` : "Enter hours worked"}</span>
          <span className="block text-xs text-ink/70 mt-1">{expiry ? `Use by ${formatDate(expiry)} · 120 days from the day worked` : "Choose a date to preview expiry"}</span>
        </div>
        <label className="flex items-start gap-2 text-sm text-ink/80">
          <input type="checkbox" required checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1 accent-jade-600" />
          I have verified the hours and eligible day using attendance records or reporting-manager/HOD confirmation. This day has not already been credited.
        </label>
      </fieldset>
      <p className="text-xs text-ink/70">Eligible biometric attendance is credited nightly. Use manual grants for verified work missing from those records.</p>
      {error && <p role="alert" className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5">{error}</p>}
      <div className="flex justify-end gap-3">
        <button type="button" disabled={busy} onClick={onCancel} className="text-sm text-ink/70 hover:text-ink px-2">Cancel</button>
        <button type="submit" disabled={busy || !employeeId || !earnedDate || !confirmed || Number(hours) <= 0 || loading || !!loadError}
          className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors">
          {busy ? "Granting…" : "Confirm grant"}
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
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("");
  const [location, setLocation] = useState("");
  const [expiryFilter, setExpiryFilter] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const load = () => {
    setLoading(true);
    setError("");
    api.get("/api/comp-off/ledger/all")
      .then(({ data }) => setRows(data))
      .catch(() => setError("Could not load the Comp-Off ledger. Please retry."))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const filtered = rows.filter((r) => (!tab || r.effective_status === tab) &&
    (!department || r.department === department) && (!location || r.location === location) &&
    `${r.name} ${r.employee_code}`.toLowerCase().includes(search.trim().toLowerCase()) &&
    (!expiryFilter || (r.effective_status === "available" && r.days_to_expiry <= Number(expiryFilter))));
  const totalDays = filtered.filter((r) => r.effective_status === "available").reduce((sum, r) => sum + Number(r.units), 0);
  const hasFilters = search || department || location || expiryFilter;
  const clearFilters = () => { setSearch(""); setDepartment(""); setLocation(""); setExpiryFilter(""); };

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
      <p className="text-sm text-ink/70 mb-5">Review earned credits and expiry dates, or grant verified work missing from attendance records.</p>
      <CompOffPolicy className="mb-5" />
      {success && <p role="status" className="text-sm text-jade-700 bg-jade-500/10 p-3 mb-4">{success}</p>}
      {showGrant && <GrantForm onGranted={(message) => { setSuccess(message); setShowGrant(false); load(); }} onCancel={() => setShowGrant(false)} />}
      <div className="bg-paper p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="block text-xs text-ink/70 space-y-1.5"><span className="font-semibold">Search employee</span>
          <input type="search" className={inputCls} placeholder="Name or employee code" value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <FilterSelect label="Department" allLabel="All departments" value={department} onChange={setDepartment} options={optionsFor(rows, "department")} />
        <FilterSelect label="Location" allLabel="All locations" value={location} onChange={setLocation} options={optionsFor(rows, "location")} />
        <label className="block text-xs text-ink/70 space-y-1.5"><span className="font-semibold">Expiry</span>
          <select aria-label="Expiry" className={inputCls} value={expiryFilter} onChange={(e) => { setExpiryFilter(e.target.value); if (e.target.value) setTab("available"); }}>
            <option value="">Any expiry</option><option value="7">Available · next 7 days</option><option value="30">Available · next 30 days</option>
          </select>
        </label>
        {hasFilters && <button type="button" onClick={clearFilters} className="text-sm text-jade-600 underline justify-self-start">Clear filters</button>}
      </div>
      {error && <p role="alert" className="text-sm text-rust-500 mb-4">{error} <button onClick={load} className="underline">Retry</button></p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4">
        <SlidingTabs tabs={TABS} value={tab} onChange={(value) => { setTab(value); if (value !== "available") setExpiryFilter(""); }} className="flex flex-wrap gap-1" />
        {tab === "available" && filtered.length > 0 && (
          <span className="text-xs text-ink/70 ml-auto font-nums">
            {totalDays} day(s) outstanding across {new Set(filtered.map((r) => r.employee_id)).size} employee(s)
          </span>
        )}
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
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
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={5}><span className="t-shimmer" data-text="Loading…">Loading…</span></td></tr>
            ) : error ? (
              <tr><td colSpan={5} className="p-8 text-center text-rust-500">Ledger unavailable. Retry above.</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={5}>
                  {hasFilters ? "No entries match these filters. Adjust or clear filters to see more." : `No ${tab || "Comp-Off"} entries. Eligible work appears after nightly accrual or a verified manual grant.`}
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
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
