import { Award, Cake, CalendarPlus, Clock, FileSpreadsheet, LogOut, ShieldAlert, UserCheck, X } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useOutletContext } from "react-router-dom";

import MonthPicker from "../../components/MonthPicker.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import LateTodayPanel from "../../components/LateTodayPanel.jsx";
import StatCard from "../../components/StatCard.jsx";
import api from "../../lib/api.js";
import { exportAttendanceExcel, exportAttendanceTimingsExcel } from "../../lib/attendanceExport.js";
import { useAuth } from "../../lib/auth.jsx";
import { daysUntilAnnualDate, formatDate, formatHoursMins, formatINR, nextAnniversary } from "../../lib/format.js";
import OfferNotices from "../../components/OfferNotices.jsx";
import { NOTIFICATION_TYPES, TONES, itemTime, markAllSeen, readSeenAt } from "../../lib/notifications.js";

// recharts is a heavy dependency (~380KB) — split out of the main bundle
// the same way Payroll.jsx lazy-imports xlsx for its Excel export.
const OtTrendChart = lazy(() => import("../../components/OtTrendChart.jsx"));

const today = new Date();
const todayIso = today.toISOString().slice(0, 10);
// Dismissal is by calendar date, not a growing "seen" set like disputes/leave
// above — a birthday banner should reappear each new day it's still true,
// not stay silenced forever after the first dismiss.
const BIRTHDAY_DISMISS_KEY = "jade_hr_birthday_dismissed_date";
const ANNIVERSARY_DISMISS_KEY = "jade_hr_anniversary_dismissed_date";
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function urgencyClass(days) {
  if (days < 0) return "text-rust-500";
  if (days <= 3) return "text-rust-500";
  if (days <= 10) return "text-ochre-700";
  return "text-ink/60";
}

function daysLabel(days) {
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

function ClockColumn({ icon: Icon, title, rows, empty, renderMeta, linkTo }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70 mb-3 flex items-center gap-1.5">
        <Icon size={13} /> {title} {rows.length > 0 && <span className="text-ink/40 normal-case font-normal">({rows.length})</span>}
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-ink/50">{empty}</p>
      ) : (
        <div className="space-y-2.5">
          {rows.slice(0, 5).map((r) => (
            <Link
              key={r.employee_id}
              to={linkTo ? linkTo(r) : `/admin/employees/${r.employee_id}`}
              className="flex items-center justify-between gap-2 group"
            >
              <div className="min-w-0">
                <p className="text-sm text-ink font-medium truncate group-hover:text-jade-600 transition-colors">{r.name}</p>
                <p className="text-xs text-ink/50 font-nums truncate">{r.employee_code} · {r.location || "—"}</p>
              </div>
              <span className={`text-xs font-semibold font-nums whitespace-nowrap ${urgencyClass(r.days_remaining)}`}>
                {daysLabel(r.days_remaining)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function ClocksPanel({ clocks }) {
  const { aip, probation, notice } = clocks;
  if (aip.length === 0 && probation.length === 0 && notice.length === 0) return null;
  return (
    <div className="bg-paper rounded-sm shadow-card px-5 py-4 mb-6">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70 mb-4 flex items-center gap-1.5">
        <Clock size={13} /> Upcoming Clocks
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ClockColumn
          icon={ShieldAlert}
          title="Active AIPs"
          rows={aip}
          empty="No active Attendance Improvement Plans."
          linkTo={() => "/admin/aip"}
        />
        <ClockColumn
          icon={UserCheck}
          title="Probation Ending"
          rows={probation}
          empty="No probation completions due soon."
          linkTo={() => "/admin/confirmations"}
        />
        <ClockColumn
          icon={LogOut}
          title="On Notice"
          rows={notice}
          empty="No one currently serving notice."
        />
      </div>
    </div>
  );
}

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
  const canAttendance = can("attendance.view") && !canPayroll;
  // Right-rail Late arrivals panel — anyone who can see attendance, incl. Accounts.
  const showLateRail = can("attendance.view");

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
  const [anniversaries, setAnniversaries] = useState([]);
  const [clocks, setClocks] = useState({ aip: [], probation: [], notice: [] });
  const [anniversaryDismissed, setAnniversaryDismissed] = useState(localStorage.getItem(ANNIVERSARY_DISMISS_KEY) === todayIso);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [attendanceLoading, setAttendanceLoading] = useState(canAttendance);

  // AdminLayout only fetches each of these when the viewer holds the
  // matching permission — an empty array here means either "none pending"
  // or "not permitted to see this queue", so no extra gating is needed
  // before rendering counts from them.
  const {
    pendingDisputes = [], pendingLeave = [], pendingPayslipApprovals = [], pendingOnboarding = [],
    pendingWorkAbsence = [], pendingWfh = [], pendingMarketVisits = [], pendingCareers = [],
  } = useOutletContext() || {};

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
    if (!canAttendance) return;
    setAttendanceLoading(true);
    api
      .get("/api/reports/attendance", { params: { year, month } })
      .then(({ data }) => setAttendanceRows(data))
      .catch(() => {})
      .finally(() => setAttendanceLoading(false));
  }, [year, month, canAttendance]);

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
      .get("/api/employees", { params: { lite: true } })
      .then(({ data }) => setEmployeeCount(data.filter((e) => e.is_active).length))
      .catch(() => {});
  }, [canPayroll, canEmployees]);

  useEffect(() => {
    if (!canEmployees) return;
    api.get("/api/employees/birthdays").then(({ data }) => setBirthdays(data)).catch(() => {});
  }, [canEmployees]);

  useEffect(() => {
    if (!canEmployees) return;
    api.get("/api/employees/anniversaries").then(({ data }) => setAnniversaries(data)).catch(() => {});
  }, [canEmployees]);

  useEffect(() => {
    if (!canEmployees) return;
    api.get("/api/clocks").then(({ data }) => setClocks(data)).catch(() => {});
  }, [canEmployees]);

  // Current month is already fetched by the payroll effect above (`rows`) —
  // only the 5 preceding months need a separate request, avoiding a duplicate
  // full-roster payroll compute for the same period.
  const [priorTrendRaw, setPriorTrendRaw] = useState([]);

  useEffect(() => {
    if (!canPayroll) return;
    const periods = Array.from({ length: 5 }, (_, i) => shiftPeriod(year, month, -(5 - i)));
    Promise.all(
      periods.map(([y, m]) =>
        api
          .get("/api/payroll", { params: { year: y, month: m } })
          .then(({ data }) => ({ label: `${SHORT_MONTHS[m - 1]} '${String(y).slice(2)}`, rows: data })),
      ),
    )
      .then(setPriorTrendRaw)
      .catch(() => setPriorTrendRaw([]));
  }, [year, month, canPayroll]);

  const trendRaw = useMemo(() => {
    if (!canPayroll) return [];
    const currentLabel = `${SHORT_MONTHS[month - 1]} '${String(year).slice(2)}`;
    return [...priorTrendRaw, { label: currentLabel, rows }];
  }, [priorTrendRaw, rows, year, month, canPayroll]);

  // Shared with the console-wide bell (components/NotificationCenter.jsx):
  // same types, same wording, same "seen" marker, so dismissing here also
  // clears the bell's "new" badge.
  const seenAt = readSeenAt();
  const pendingByType = {
    leave: pendingLeave, disputes: pendingDisputes, payslipApprovals: pendingPayslipApprovals,
    onboarding: pendingOnboarding, workAbsence: pendingWorkAbsence, wfh: pendingWfh,
    marketVisits: pendingMarketVisits, careers: pendingCareers,
  };
  const NOTIFICATION_GROUPS = NOTIFICATION_TYPES
    .map((t) => ({ ...t, items: (pendingByType[t.key] || []).filter((i) => itemTime(i) > seenAt) }))
    .filter((g) => g.items.length > 0);
  const hasNew = !dismissed && NOTIFICATION_GROUPS.length > 0;

  const dismiss = () => {
    markAllSeen();
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

  const activeAnniversaries = anniversaries.filter((a) => a.is_active && a.date_of_joining);
  const todaysAnniversaries = activeAnniversaries.filter((a) => nextAnniversary(a.date_of_joining).days === 0);
  const upcomingAnniversaries = useMemo(
    () => [...activeAnniversaries].sort((a, b) => nextAnniversary(a.date_of_joining).days - nextAnniversary(b.date_of_joining).days).slice(0, 5),
    [anniversaries],
  );
  const showAnniversaryBanner = !anniversaryDismissed && todaysAnniversaries.length > 0;

  const dismissAnniversary = () => {
    localStorage.setItem(ANNIVERSARY_DISMISS_KEY, todayIso);
    setAnniversaryDismissed(true);
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
      <OfferNotices />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-1">
        <h2 className="font-display text-2xl text-ink">Dashboard</h2>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/admin/my-leave"
            className="flex items-center gap-1.5 bg-jade-600 text-white px-3 py-2 rounded-sm text-xs font-semibold hover:bg-jade-700 transition-colors whitespace-nowrap"
          >
            <CalendarPlus size={13} /> Apply Leave
          </Link>
          {canPayroll && (
            <>
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
            </>
          )}
        </div>
      </div>
      {canBiometric && (
        <p className="text-xs text-ink/70 font-nums mb-6">
          {lastSync
            ? `Last biometric sync ${new Date(lastSync.run_at).toLocaleString("en-IN")} — ${lastSync.inserted} new punches`
            : "No biometric sync has run yet."}
        </p>
      )}

      {hasNew && (
        <section className="rise-in mb-6 rounded-sm border border-ochre-400/50 bg-ochre-50 shadow-card" aria-labelledby="new-items-title">
          <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
            <h3 id="new-items-title" className="flex items-center gap-2 text-sm font-semibold text-ink">
              <span className="relative flex w-2.5 h-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-rust-500 opacity-60 animate-ping motion-reduce:hidden" />
                <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-rust-500" />
              </span>
              New since you last checked
            </h3>
            <button onClick={dismiss} className="flex items-center gap-1 text-xs font-semibold text-ink/60 hover:text-ink">
              <X size={14} /> Mark all seen
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 px-4 pb-4">
            {NOTIFICATION_GROUPS.map((g) => {
              const tone = TONES[g.tone];
              const Icon = g.icon;
              return (
                <Link key={g.key} to={g.to} className="group flex items-center gap-3 bg-paper rounded-sm px-3.5 py-3 border border-ink/[0.07] hover:border-jade-500 hover:shadow-stamp transition-all">
                  <span className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tone.chip}`}><Icon size={17} /></span>
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-1.5">
                      <span className="font-display text-2xl text-ink font-nums leading-none">{g.items.length}</span>
                      <span className="text-sm text-ink truncate">new {g.items.length === 1 ? g.singular : g.plural}</span>
                    </span>
                    <span className={`block text-xs font-semibold mt-1 ${tone.text} group-hover:underline`}>{g.cta} →</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
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

      <div className={showLateRail ? "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start" : ""}>
      {showLateRail && (
        <aside className="order-1 xl:order-2 xl:sticky xl:top-4">
          <LateTodayPanel />
        </aside>
      )}
      <div className="order-2 xl:order-1 min-w-0">
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
                  <span className="text-ink/70 ml-1.5 font-nums text-xs">
                    {formatDate(b.date_of_birth)} · {days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showAnniversaryBanner && (
        <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50">
          <div className="bg-paper rounded-sm shadow-stamp w-full max-w-sm p-7 border-t-4 border-jade-500 relative text-center">
            <button onClick={dismissAnniversary} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
              <X size={18} />
            </button>
            <div className="w-14 h-14 rounded-full bg-jade-500/15 flex items-center justify-center mx-auto mb-4">
              <Award size={26} className="text-jade-700" />
            </div>
            <p className="font-display text-lg text-ink mb-1">
              {todaysAnniversaries.length > 1 ? "Work anniversaries today!" : "Work anniversary today!"}
            </p>
            <p className="text-sm text-ink/70">
              {todaysAnniversaries
                .map((a) => {
                  const { years } = nextAnniversary(a.date_of_joining);
                  return `${a.name} (${years} yr${years === 1 ? "" : "s"})`;
                })
                .join(", ")}
            </p>
            <button
              onClick={dismissAnniversary}
              className="mt-6 bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {upcomingAnniversaries.length > 0 && (
        <div className="bg-paper rounded-sm shadow-card px-5 py-4 mb-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70 mb-3 flex items-center gap-1.5">
            <Award size={13} /> Upcoming Work Anniversaries (HQ)
          </p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {upcomingAnniversaries.map((a) => {
              const { days, years } = nextAnniversary(a.date_of_joining);
              return (
                <div key={a.employee_id} className="text-sm">
                  <span className="text-ink font-medium">{a.name}</span>
                  <span className="text-ink/70 ml-1.5 font-nums text-xs">
                    {years} yr{years === 1 ? "" : "s"} · {days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days}d`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {canEmployees && <ClocksPanel clocks={clocks} />}

      {error && <p className="text-sm text-rust-500 mb-4 border-l-2 border-rust-500 pl-2.5">{error}</p>}

      {canPayroll ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 stagger-rise">
            <StatCard label="Active Employees" value={filtered.length} />
            <StatCard label="Total OT Hours" value={formatHoursMins(totals.otHours)} />
            <StatCard label="Total OT Amount" value={formatINR(totals.otAmount)} accent="text-ochre-700" />
            <StatCard label="Total Payable" value={formatINR(totals.payable)} accent="text-jade-600" />
          </div>

          {trend.length > 0 && (
            <Suspense fallback={<div className="rounded-sm mb-8 h-[284px] bg-ink/[0.03]" />}>
              <OtTrendChart data={trend} />
            </Suspense>
          )}

          <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left sticky top-0 z-10 bg-paper shadow-[0_1px_0_rgba(0,0,0,0.08)]">
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
                  <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={6}>Loading ledger…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={6}>No employees match.</td></tr>
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
                      <td className="px-5 py-3.5 font-nums">{formatHoursMins(r.total_ot_hours)}</td>
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
          {canAttendance && (
            <div className="bg-paper rounded-sm shadow-card px-6 py-5 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-ink">Attendance</p>
                  <p className="text-xs text-ink/70 mt-0.5">
                    Export the full attendance sheet for every active employee.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
                  <button
                    onClick={() => exportAttendanceExcel(attendanceRows, year, month)}
                    disabled={!attendanceRows.length}
                    className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
                  >
                    <FileSpreadsheet size={15} /> {attendanceLoading ? "Loading…" : "Export Excel"}
                  </button>
                  <button
                    onClick={() => exportAttendanceTimingsExcel(attendanceRows, year, month)}
                    disabled={!attendanceRows.length}
                    className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
                  >
                    <FileSpreadsheet size={15} /> {attendanceLoading ? "Loading…" : "Export Timings (Datewise)"}
                  </button>
                  <Link to="/admin/reports/attendance" className="text-xs text-jade-700 hover:underline font-medium whitespace-nowrap">
                    View full sheet
                  </Link>
                </div>
              </div>
            </div>
          )}
          <div className="bg-paper rounded-sm shadow-card px-6 py-10 text-center">
            <p className="text-sm text-ink/70">Payroll &amp; OT figures are managed by Accounts.</p>
            <p className="text-xs text-ink/65 mt-1">Use Disputes and Leave in the sidebar for pending approvals.</p>
          </div>
        </>
      )}
      </div>
      </div>
    </div>
  );
}
