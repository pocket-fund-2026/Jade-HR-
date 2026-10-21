import { ArrowDownUp, Check, ShieldAlert, Users, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import LeaveRequestModal from "../../components/LeaveRequestModal.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";
import { LEAVE_LABELS } from "../../lib/leaveTypes.js";
import SlidingTabs from "../../components/SlidingTabs.jsx";

const NO_MANAGER = "No reporting manager";
const NO_DEPT = "No department";

const dayCount = (r) => (new Date(r.end_date) - new Date(r.start_date)) / 86400000 + 1;
const fullName = (r) => `${r.hr_employees?.first_name || ""} ${r.hr_employees?.last_name || ""}`.trim();
const managerOf = (r) => r.hr_employees?.reporting_manager || NO_MANAGER;
const deptOf = (r) => r.hr_employees?.department || NO_DEPT;

const SORTS = {
  newest: { label: "Newest request first", cmp: (a, b) => (b.created_at || "").localeCompare(a.created_at || "") },
  oldest: { label: "Oldest request first (waiting longest)", cmp: (a, b) => (a.created_at || "").localeCompare(b.created_at || "") },
  starts: { label: "Leave starts soonest", cmp: (a, b) => a.start_date.localeCompare(b.start_date) },
  longest: { label: "Most days first", cmp: (a, b) => dayCount(b) - dayCount(a) },
  employee: { label: "Employee A–Z", cmp: (a, b) => fullName(a).localeCompare(fullName(b)) },
  manager: { label: "Reporting manager A–Z", cmp: (a, b) => managerOf(a).localeCompare(managerOf(b)) || fullName(a).localeCompare(fullName(b)) },
  type: { label: "Leave type", cmp: (a, b) => (LEAVE_LABELS[a.leave_type] || "").localeCompare(LEAVE_LABELS[b.leave_type] || "") },
};

const filterCls = "rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

// Per-team (reporting manager or department) roll-up of the requests in
// view; a card click filters the table to that team.
function TeamSummary({ requests, groupBy, setGroupBy, active, onPick }) {
  const teams = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const byTeam = new Map();
    requests.forEach((r) => {
      const key = groupBy === "manager" ? managerOf(r) : deptOf(r);
      const t = byTeam.get(key) || { key, email: groupBy === "manager" ? r.hr_employees?.reporting_manager_email : null, requests: 0, days: 0, people: new Set(), onLeaveToday: new Set(), types: {} };
      t.requests += 1;
      t.days += dayCount(r);
      t.people.add(r.employee_id);
      if (r.start_date <= today && r.end_date >= today) t.onLeaveToday.add(r.employee_id);
      const label = LEAVE_LABELS[r.leave_type] || r.leave_type;
      t.types[label] = (t.types[label] || 0) + 1;
      byTeam.set(key, t);
    });
    const none = groupBy === "manager" ? NO_MANAGER : NO_DEPT;
    return [...byTeam.values()].sort((a, b) => (a.key === none) - (b.key === none) || b.requests - a.requests || a.key.localeCompare(b.key));
  }, [requests, groupBy]);

  if (!requests.length) return null;
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between gap-3 mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70 flex items-center gap-1.5">
          <Users size={12} /> {teams.length} team{teams.length === 1 ? "" : "s"} · {requests.length} request{requests.length === 1 ? "" : "s"}
        </p>
        <div className="flex rounded-sm border border-ink/15 overflow-hidden text-xs">
          {[["manager", "By reporting manager"], ["department", "By department"]].map(([v, l]) => (
            <button key={v} onClick={() => setGroupBy(v)} className={`px-2.5 py-1.5 ${groupBy === v ? "bg-jade-500 text-white" : "bg-paper text-ink"}`}>{l}</button>
          ))}
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {teams.map((t) => {
          const isActive = active === t.key;
          const isNone = t.key === NO_MANAGER || t.key === NO_DEPT;
          return (
            <button
              key={t.key} type="button" onClick={() => onPick(isActive ? "" : t.key)}
              className={`flex-shrink-0 w-52 text-left bg-paper rounded-sm shadow-card px-3.5 py-3 border-t-2 transition-colors ${isActive ? "border-jade-500 ring-1 ring-jade-500/40" : "border-ink/10 hover:border-ink/30"}`}
            >
              <p className={`text-sm font-medium truncate ${isNone ? "text-ink/50 italic" : "text-ink"}`}>{t.key}</p>
              {groupBy === "manager" && !isNone && (
                <p className={`text-[11px] truncate ${t.email ? "text-jade-700" : "text-ochre-700"}`}>{t.email || "No email on file"}</p>
              )}
              <p className="text-xs text-ink/70 mt-1 font-nums">
                <span className="text-ink font-semibold">{t.requests}</span> request{t.requests === 1 ? "" : "s"} · {t.days} day{t.days === 1 ? "" : "s"} · {t.people.size} {t.people.size === 1 ? "person" : "people"}
              </p>
              <p className="text-[11px] text-ink/55 mt-0.5 truncate">
                {Object.entries(t.types).map(([k, n]) => `${n} ${k}`).join(" · ")}
              </p>
              {t.onLeaveToday.size > 0 && (
                <p className="text-[11px] text-ochre-700 mt-0.5">{t.onLeaveToday.size} on leave today</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function ReportsTo({ name, email }) {
  return (
    <div className={`text-xs mt-0.5 min-w-[210px] max-w-[260px] ${name ? "text-ink/70" : "text-ink/40 italic"}`}>
      {name ? <>Reports to <span className="text-ink/90">{name}</span></> : "No reporting manager"}
      {name && (email
        ? <a href={`mailto:${email}`} title={email} className="block text-[11px] text-jade-700 hover:underline truncate">{email}</a>
        : <span className="block text-[11px] text-ochre-700">No manager email on file</span>)}
    </div>
  );
}

function ResolveRow({ request, onResolved }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = async (action) => {
    setBusy(true);
    try {
      await api.put(`/api/leave-requests/${request.id}`, { action, admin_note: note });
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  const employee = request.hr_employees;
  const days = dayCount(request);

  return (
    <tr className="border-b border-ink/[0.06] last:border-0 align-top">
      <td className="px-5 py-3.5">
        <span className="text-ink font-medium">{employee?.first_name} {employee?.last_name}</span>
        <div className="text-xs text-ink/70 font-nums">{employee?.employee_code}</div>
        <ReportsTo name={employee?.reporting_manager} email={employee?.reporting_manager_email} />
      </td>
      <td className="px-5 py-3.5 text-ink/70">{employee?.location || "—"}</td>
      <td className="px-5 py-3.5 text-ink/70">{LEAVE_LABELS[request.leave_type]}</td>
      <td className="px-5 py-3.5 font-nums text-ink/70">
        {formatDate(request.start_date)}–{formatDate(request.end_date)}
        <div className="text-xs text-ink/70">{days} day{days > 1 ? "s" : ""}</div>
      </td>
      <td className="px-5 py-3.5 max-w-xs text-ink/70">
        {request.reason}
        {request.created_at && <div className="text-[11px] text-ink/50 mt-0.5 font-nums">Requested {formatDate(request.created_at)}</div>}
      </td>
      <td className="px-5 py-3.5">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Note (optional)" placeholder="Note (optional)"
          className="w-40 rounded-sm border border-ink/15 bg-manila/40 px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-jade-500"
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

// HR's override for the Red Card leave-request block (policy allows "a
// documented medical emergency or approved exception by Management") — no
// employee self-service path can reach this; filing it here IS the exception.
function RedCardExceptionTrigger({ onFiled }) {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    api.get("/api/employees", { params: { lite: true } }).then(({ data }) => setEmployees(data));
  }, []);

  const corporateEmployees = useMemo(
    () => employees.filter((e) => e.employee_category === "corporate" && e.is_active)
      .sort((a, b) => a.first_name.localeCompare(b.first_name)),
    [employees],
  );
  const target = corporateEmployees.find((e) => e.id === employeeId);

  return (
    <div className="flex items-center gap-2">
      <select
        aria-label="Employee to file a Red Card exception for"
        value={employeeId}
        onChange={(e) => setEmployeeId(e.target.value)}
        className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
      >
        <option value="">File Red Card exception for…</option>
        {corporateEmployees.map((e) => (
          <option key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.employee_code})</option>
        ))}
      </select>
      <button
        type="button"
        disabled={!target}
        onClick={() => setModalOpen(true)}
        className="flex items-center gap-1.5 bg-paper border border-ochre-500 text-ochre-700 px-3 py-2 rounded-sm text-sm font-semibold hover:bg-ochre-50 disabled:opacity-40 transition-colors"
      >
        <ShieldAlert size={15} /> File Exception
      </button>
      {modalOpen && target && (
        <LeaveRequestModal
          onBehalfOf={target}
          onClose={() => setModalOpen(false)}
          onSubmitted={() => { setModalOpen(false); setEmployeeId(""); onFiled(); }}
        />
      )}
    </div>
  );
}

const POLL_MS = 20000;

export default function Leave() {
  const { pendingLeave: layoutPendingLeave, pendingLoaded } = useOutletContext() || {};
  const hasLayoutData = pendingLoaded && layoutPendingLeave !== undefined;
  const [tab, setTab] = useState("pending");
  const [requests, setRequests] = useState(() => (hasLayoutData ? layoutPendingLeave : []));
  const [loading, setLoading] = useState(!hasLayoutData);
  const [location, setLocation] = useState("all");
  const [sort, setSort] = useState("oldest");
  const [groupBy, setGroupBy] = useState("manager");
  const [team, setTeam] = useState("");
  const [q, setQ] = useState("");
  const skipNextLoad = useRef(hasLayoutData);

  const load = (silent) => {
    if (!silent) setLoading(true);
    api.get("/api/leave-requests", { params: { status: tab } }).then(({ data }) => setRequests(data)).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (skipNextLoad.current) {
      skipNextLoad.current = false;
    } else {
      load();
    }
    if (tab !== "pending") return;
    const interval = setInterval(() => load(true), POLL_MS);
    return () => clearInterval(interval);
  }, [tab]);

  const locations = useMemo(
    () => [...new Set(requests.map((r) => r.hr_employees?.location).filter(Boolean))].sort(),
    [requests],
  );
  const byLocation = useMemo(
    () => (location === "all" ? requests : requests.filter((r) => r.hr_employees?.location === location)),
    [requests, location],
  );
  const filtered = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return byLocation
      .filter((r) => !team || (groupBy === "manager" ? managerOf(r) : deptOf(r)) === team)
      .filter((r) => {
        if (!words.length) return true;
        const hay = `${fullName(r)} ${r.hr_employees?.employee_code || ""} ${managerOf(r)} ${deptOf(r)} ${LEAVE_LABELS[r.leave_type] || ""} ${r.reason || ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice()
      .sort(SORTS[sort].cmp);
  }, [byLocation, team, groupBy, q, sort]);
  const changeGroupBy = (v) => { setGroupBy(v); setTeam(""); };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Leave Requests</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">Casual, sick, earned & unpaid leave</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by location"
            value={location}
            onChange={(e) => { setLocation(e.target.value); setTeam(""); }}
            className={filterCls}
          >
            <option value="all">All locations</option>
            {locations.map((loc) => (
              <option key={loc} value={loc}>{loc}</option>
            ))}
          </select>
          <RedCardExceptionTrigger onFiled={() => load(true)} />
        </div>
      </div>

      <SlidingTabs tabs={TABS} value={tab} onChange={(t) => { setTab(t); setTeam(""); }} className="flex gap-1 mb-4" />

      <TeamSummary requests={byLocation} groupBy={groupBy} setGroupBy={changeGroupBy} active={team} onPick={setTeam} />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <input
          value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search leave requests"
          placeholder="Search employee, manager, type, reason…" className={`${filterCls} w-72 max-w-full`}
        />
        <label className="flex items-center gap-1.5 text-sm text-ink/70">
          <ArrowDownUp size={14} />
          <select aria-label="Sort leave requests" value={sort} onChange={(e) => setSort(e.target.value)} className={filterCls}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </label>
        {team && (
          <span className="inline-flex items-center gap-1.5 rounded-sm bg-ledger-800 text-manila px-3 py-2 text-sm">
            {groupBy === "manager" ? "Team" : "Department"}: {team}
            <button onClick={() => setTeam("")} aria-label="Clear team filter"><X size={14} /></button>
          </span>
        )}
        {(team || q) && <span className="text-xs text-ink/60">Showing {filtered.length} of {byLocation.length}</span>}
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left sticky top-0 z-10 bg-paper shadow-[0_1px_0_rgba(0,0,0,0.08)]">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Location</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Type</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Dates</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Reason</th>
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Note</th>}
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Action</th>}
              {tab !== "pending" && <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={7}>Loading ledger…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={7}>No {tab} leave requests.</td></tr>
            ) : tab === "pending" ? (
              filtered.map((r) => <ResolveRow key={r.id} request={r} onResolved={load} />)
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.hr_employees?.employee_code}</div>
                    <ReportsTo name={r.hr_employees?.reporting_manager} email={r.hr_employees?.reporting_manager_email} />
                  </td>
                  <td className="px-5 py-3.5 text-ink/70">{r.hr_employees?.location || "—"}</td>
                  <td className="px-5 py-3.5 text-ink/70">{LEAVE_LABELS[r.leave_type]}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(r.start_date)}–{formatDate(r.end_date)}</td>
                  <td className="px-5 py-3.5 text-ink/70 max-w-xs">{r.reason}</td>
                  <td className="px-5 py-3.5"><StampBadge status={r.status}>{r.status}</StampBadge></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
