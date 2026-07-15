import { Bell, Cake, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import MonthPicker from "../../components/MonthPicker.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import StatCard from "../../components/StatCard.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { daysUntilAnnualDate, formatDate, formatINR } from "../../lib/format.js";

// recharts is a heavy dependency (~380KB) — split out of the main bundle
// the same way Payroll.jsx lazy-imports xlsx for its Excel export.
const OtTrendChart = lazy(() => import("../../components/OtTrendChart.jsx"));

const today = new Date();
const todayIso = today.toISOString().slice(0, 10);
const SEEN_KEY = "jade_hr_admin_notif_seen_at";
// Dismissal is by calendar date, not a growing "seen" set like disputes/leave
// above — a birthday banner should reappear each new day it's still true,
// not stay silenced forever after the first dismiss.
const BIRTHDAY_DISMISS_KEY = "jade_hr_birthday_dismissed_date";
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shiftPeriod(year, month, delta) {
  let m = month + delta;
  let y = year;
  while (m < 1) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return [y, m];
}

export default function Dashboard() {
  const { can } = useAuth();
  const canPayroll = can("payroll.view");
  const canBiometric = can("biometric.view");
  const canEmployees = can("employees.view");

  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(canPayroll);
  const [error, setError] = useState("");
  const [lastSync, setLastSync] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const [location, setLocation] = useState("all");
  const [employeeCount, setEmployeeCount] = useState(null);
  const [birthdays, setBirthdays] = useState([]);
  const [birthdayDismissed, setBirthdayDismissed] = useState(localStorage.getItem(BIRTHDAY_DISMISS_KEY) === todayIso);

  const { pendingDisputes = [], pendingLeave = [] } = useOutletContext() || {};

  useEffect(() => {
    if (!canPayroll) return;
    setLoading(true);
    api
      .get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .catch(() => setError("Could not load payroll summary"))
      .finally(() => setLoading(false));
  }, [year, month, canPayroll]);

  useEffect(() => {
    if (!canBiometric) return;
    api
      .get("/api/biometric/sync-log")
      .then(({ data }) => setLastSync(data[0] || null))
      .catch(() => {});
  }, [canBiometric]);

  useEffect(() => {
    if (canPayroll || !canEmployees) return;
    api
      .get("/api/employees")
      .then(({ data }) => setEmployeeCount(data.filter((e) => e.is_active).length))
      .catch(() => {});
  }, [canPayroll, canEmployees]);

  useEffect(() => {
    if (!canEmployees) return;
    api.get("/api/employees/birthdays").then(({ data }) => setBirthdays(data)).catch(() => {});
  }, [canEmployees]);

  const [trendRaw, setTrendRaw] = useState([]);

  useEffect(() => {
    if (!canPayroll) return;
    const periods = Array.from({ length: 6 }, (_, i) => shiftPeriod(year, month, -(5 - i)));
    Promise.all(
      periods.map(([y, m]) =>
        api
          .get("/api/payroll", { params: { year: y, month: m } })
          .then(({ data }) => ({ label: `${SHORT_MONTHS[m - 1]} '${String(y).slice(2)}`, rows: data })),
      ),
    )
      .then(setTrendRaw)
      .catch(() => setTrendRaw([]));
  }, [year, month, canPayroll]);

  const seenAt = localStorage.getItem(SEEN_KEY) || "1970-01-01";
  const newDisputes = pendingDisputes.filter((d) => d.created_at > seenAt);
  const newLeave = pendingLeave.filter((l) => l.created_at > seenAt);
  const hasNew = !dismissed && (newDisputes.length > 0 || newLeave.length > 0);

  const dismiss = () => {
    localStorage.setItem(SEEN_KEY, new Date().toISOString());
    setDismissed(true);
  };

  const activeBirthdays = birthdays.filter((b) => b.is_active && b.date_of_birth);
  const todaysBirthdays = activeBirthdays.filter((b) => daysUntilAnnualDate(b.date_of_birth) === 0);
  const upcomingBirthdays = useMemo(
    () => [...activeBirthdays].sort((a, b) => daysUntilAnnualDate(a.date_of_birth) - daysUntilAnnualDate(b.date_of_birth)).slice(0, 5),
    [birthdays],
  );
  const showBirthdayBanner = !birthdayDismissed && todaysBirthdays.length > 0;

  const dismissBirthday = () => {
    localStorage.setItem(BIRTHDAY_DISMISS_KEY, todayIso);
    setBirthdayDismissed(true);
  };

  const locations = useMemo(
    () => [...new Set(rows.map((r) => r.location).filter(Boolean))].sort(),
    [rows],
  );
  const filtered = useMemo(
    () => (location === "all" ? rows : rows.filter((r) => r.location === location)),
    [rows, location],
  );

  const trend = useMemo(
    () =>
      trendRaw.map((p) => ({
        label: p.label,
        ot_hours: Math.round((location === "all" ? p.rows : p.rows.filter((r) => r.location === location))
          .reduce((sum, r) => sum + r.total_ot_hours, 0) * 10) / 10,
      })),
    [trendRaw, location],
  );

  const totals = filtered.reduce(
    (acc, r) => ({
      otHours: acc.otHours + r.total_ot_hours,
      otAmount: acc.otAmount + r.ot_amount,
      payable: acc.payable + r.total_payable,
    }),
    { otHours: 0, otAmount: 0, payable: 0 },
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
        <h2 className="font-display text-2xl text-ink">Dashboard</h2>
        {canPayroll && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              aria-label="Filter by location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
            >
              <option value="all">All locations</option>
              {locations.map((loc) => (
                <option key={loc} value={loc}>{loc}</option>
              ))}
            </select>
            <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
          </div>
        )}
      </div>
      {canBiometric && (
        <p className="text-xs text-ink/70 font-nums mb-6">
          {lastSync
            ? `Last biometric sync ${new Date(lastSync.run_at).toLocaleString("en-IN")} — ${lastSync.inserted} new punches`
            : "No biometric sync has run yet."}
        </p>
      )}

      {hasNew && (
        <div className="bg-ochre-50 border border-ochre-400/40 rounded-sm px-4 py-3 mb-6 flex items-start gap-3">
          <Bell size={16} className="text-ochre-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1 space-y-1 text-sm text-ink/80">
            {newLeave.length > 0 && (
              <p>
                {newLeave.length} new leave request{newLeave.length > 1 ? "s" : ""} awaiting review —{" "}
                <Link to="/admin/leave" className="text-jade-700 hover:underline font-medium">Review leave</Link>
              </p>
            )}
            {newDisputes.length > 0 && (
              <p>
                {newDisputes.length} new attendance dispute{newDisputes.length > 1 ? "s" : ""} awaiting review —{" "}
                <Link to="/admin/disputes" className="text-jade-700 hover:underline font-medium">Review disputes</Link>
              </p>
            )}
          </div>
          <button onClick={dismiss} aria-label="Dismiss" className="text-ink/70 hover:text-ink">
            <X size={16} />
          </button>
        </div>
      )}

      {showBirthdayBanner && (
        <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50">
          <div className="bg-paper rounded-sm shadow-stamp w-full max-w-sm p-7 border-t-4 border-jade-500 relative text-center">
            <button onClick={dismissBirthday} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
              <X size={18} />
            </button>
            <div className="w-14 h-14 rounded-full bg-jade-500/15 flex items-center justify-center mx-auto mb-4">
              <Cake size={26} className="text-jade-700" />
            </div>
            <p className="font-display text-lg text-ink mb-1">
              {todaysBirthdays.length > 1 ? "Birthdays today!" : "Birthday today!"}
            </p>
            <p className="text-sm text-ink/70">
              {todaysBirthdays.map((b) => b.name).join(", ")}
            </p>
            <button
              onClick={dismissBirthday}
              className="mt-6 bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {upcomingBirthdays.length > 0 && (
        <div className="bg-paper rounded-sm shadow-card px-5 py-4 mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70 mb-3 flex items-center gap-1.5">
            <Cake size={13} /> Upcoming Birthdays (HQ)
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {upcomingBirthdays.map((b) => {
              const days = daysUntilAnnualDate(b.date_of_birth);
              return (
                <div key={b.employee_id} className="text-sm">
                  <span className="text-ink font-medium">{b.name}</span>
                  <span className="text-ink/60 ml-1.5 font-nums text-xs">
                    {formatDate(b.date_of_birth)} · {days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-sm text-rust-500 mb-4 border-l-2 border-rust-500 pl-2.5">{error}</p>}

      {canPayroll ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 stagger-rise">
            <StatCard label="Active Employees" value={filtered.length} />
            <StatCard label="Total OT Hours" value={totals.otHours.toFixed(1)} />
            <StatCard label="Total OT Amount" value={formatINR(totals.otAmount)} accent="text-ochre-700" />
            <StatCard label="Total Payable" value={formatINR(totals.payable)} accent="text-jade-600" />
          </div>

          {trend.length > 0 && (
            <Suspense fallback={<div className="rounded-sm mb-8 h-[284px] bg-ink/[0.03]" />}>
              <OtTrendChart data={trend} />
            </Suspense>
          )}

          <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left sticky top-0 z-10 bg-paper">
                <tr className="border-b-2 border-ink/10">
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Present</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Absent</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">OT Hours</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">OT Amount</th>
                  <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Total Payable</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={6}>Loading ledger…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={6}>No employees match.</td></tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link to={`/admin/payroll/${r.employee_id}?year=${year}&month=${month}`} className="text-ink hover:text-jade-600 font-medium transition-colors">
                          {r.name}
                        </Link>
                        <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                      </td>
                      <td className="px-5 py-3.5 font-nums">{r.present_days}/{r.days_in_month}</td>
                      <td className="px-5 py-3.5 font-nums">
                        {r.absent_days > 0 ? <StampBadge status="absent">{r.absent_days} absent</StampBadge> : <span className="text-ink/65">—</span>}
                      </td>
                      <td className="px-5 py-3.5 font-nums">{r.total_ot_hours}</td>
                      <td className="px-5 py-3.5 font-nums text-ochre-700">{formatINR(r.ot_amount)}</td>
                      <td className="px-5 py-3.5 font-nums font-semibold text-ink">{formatINR(r.total_payable)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          {canEmployees && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 stagger-rise">
              <StatCard label="Active Employees" value={employeeCount ?? "—"} />
            </div>
          )}
          <div className="bg-paper rounded-sm shadow-card px-6 py-10 text-center">
            <p className="text-sm text-ink/70">Payroll &amp; OT figures are managed by Accounts.</p>
            <p className="text-xs text-ink/65 mt-1">Use Disputes and Leave in the sidebar for pending approvals.</p>
          </div>
        </>
      )}
    </div>
  );
}
