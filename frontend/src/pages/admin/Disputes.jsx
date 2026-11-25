import EmptyState from "../../components/EmptyState.jsx";
import { Check, Paperclip, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext } from "react-router-dom";

import { useAuth } from "../../lib/auth.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";
import SlidingTabs from "../../components/SlidingTabs.jsx";

const TABS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

function RespondBox({ dispute, onDone }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [reopen, setReopen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { user } = useAuth();
  if (dispute.employee_id === user?.id) return null;
  const send = async () => {
    setBusy(true);
    setError("");
    try {
      await api.post(`/api/disputes/${dispute.id}/respond`, { note, reopen });
      setOpen(false);
      setNote("");
      setReopen(false);
      onDone();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not send the response");
    } finally {
      setBusy(false);
    }
  };
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="text-xs text-jade-700 hover:underline mt-1.5">
        {dispute.hr_response ? "Edit HR response" : "Respond"}
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2">
      <textarea aria-label="HR response" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your response to the employee"
        className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 min-h-[64px]" />
      {dispute.status === "rejected" && (
        <label className="flex items-center gap-2 text-xs text-ink/80">
          <input type="checkbox" checked={reopen} onChange={(e) => setReopen(e.target.checked)} /> Reopen for a new decision
        </label>
      )}
      {error && <p className="text-xs text-rust-500">{error}</p>}
      <div className="flex gap-3 items-center">
        <button type="button" disabled={busy || note.trim().length < 3} onClick={send}
          className="bg-ledger-800 text-manila px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors">
          {busy ? "Sending…" : "Send response"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink/70 hover:text-ink">Cancel</button>
      </div>
    </div>
  );
}

function DelayAndResponse({ dispute }) {
  return (
    <>
      {dispute.delay_reason && (
        <p className="text-xs text-ochre-700 mt-1.5"><strong>Reason for delay:</strong> {dispute.delay_reason}</p>
      )}
      {dispute.hr_response && (
        <p className="text-xs text-ink/80 mt-1.5 border-l-2 border-jade-500 pl-2"><strong>HR response:</strong> {dispute.hr_response}</p>
      )}
    </>
  );
}

function ResolveRow({ dispute, onResolved }) {
  const [firstIn, setFirstIn] = useState(dispute.claimed_in?.slice(0, 5) || "");
  const [lastOut, setLastOut] = useState(dispute.claimed_out?.slice(0, 5) || "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const resolve = async (action) => {
    setBusy(true);
    try {
      await api.put(`/api/disputes/${dispute.id}`, {
        action,
        admin_note: note,
        first_in: firstIn ? `${firstIn}:00` : null,
        last_out: lastOut ? `${lastOut}:00` : null,
        status_override: dispute.issue_type === "weekly_off" ? "weekoff" : "present",
      });
      onResolved();
    } catch (err) {
      window.alert(err.response?.data?.detail || "Could not settle this dispute");
      onResolved();
    } finally {
      setBusy(false);
    }
  };

  const employee = dispute.hr_employees;
  const { user } = useAuth();
  const isOwn = dispute.employee_id === user?.id;

  return (
    <tr className="border-b border-ink/[0.06] last:border-0 align-top">
      <td className="px-5 py-3.5">
        <span className="text-ink font-medium">{employee?.first_name} {employee?.last_name}</span>
        <div className="text-xs text-ink/70 font-nums">{employee?.employee_code}</div>
      </td>
      <td className="px-5 py-3.5 text-ink/70">{employee?.location || "—"}</td>
      <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(dispute.date)}</td>
      <td className="px-5 py-3.5 max-w-xs">
        <p className="text-ink/70">{dispute.reason}</p>
        <p className="text-xs text-ink/70 mt-0.5">{dispute.issue_type.replace(/_/g, " ")}</p>
        {dispute.appeal_of && (
          <p className="text-xs text-ochre-700 mt-1"><strong>APPEAL</strong> of a rejection{dispute.appeal_original_by ? ` by ${dispute.appeal_original_by}` : ""}{dispute.appeal_original_note ? `: "${dispute.appeal_original_note}"` : ""}</p>
        )}
        {dispute.photo_url && (
          <a href={dispute.photo_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-jade-700 hover:underline mt-1">
            <Paperclip size={11} /> {dispute.photo_filename || "Photo"}
          </a>
        )}
        <DelayAndResponse dispute={dispute} />
        <RespondBox dispute={dispute} onDone={onResolved} />
      </td>
      <td className="px-5 py-3.5">
        <div className="flex gap-2">
          <input
            type="time"
            value={firstIn}
            onChange={(e) => setFirstIn(e.target.value)}
            aria-label="Actual clock-in" placeholder="In"
            className="w-24 rounded-sm border border-ink/15 bg-manila/40 px-4 py-1.5 text-xs font-nums focus:outline-none focus:ring-2 focus:ring-jade-500"
          />
          <input
            type="time"
            value={lastOut}
            onChange={(e) => setLastOut(e.target.value)}
            aria-label="Actual clock-out" placeholder="Out"
            className="w-24 rounded-sm border border-ink/15 bg-manila/40 px-4 py-1.5 text-xs font-nums focus:outline-none focus:ring-2 focus:ring-jade-500"
          />
        </div>
      </td>
      <td className="px-5 py-3.5">
        {isOwn ? (
          <p className="text-xs text-ink/70 max-w-[11rem]">Your own dispute. Another reviewer has to settle it.</p>
        ) : (
        <div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Remark (required)" placeholder="Remark (required, say why)"
          className="w-56 mb-2 rounded-sm border border-ink/15 bg-manila/40 px-4 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-jade-500"
        />
        <div className="flex gap-8">
          <button
            disabled={busy || note.trim().length < 5}
            onClick={() => resolve("reject")}
            className="flex items-center gap-1 bg-paper border border-rust-500 text-rust-500 px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-rust-50 disabled:opacity-50 transition-colors"
          >
            <X size={13} /> Reject dispute
          </button>
          <button
            disabled={busy || note.trim().length < 5}
            onClick={() => resolve("approve")}
            className="flex items-center gap-1 bg-jade-600 text-white px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors"
          >
            <Check size={13} /> Approve dispute
          </button>
        </div>
        </div>
        )}
      </td>
    </tr>
  );
}

const POLL_MS = 20000;

export default function Disputes() {
  const { pendingDisputes: layoutPendingDisputes, pendingLoaded } = useOutletContext() || {};
  // AdminLayout's sidebar-badge poll already fetched this exact list — reuse
  // it for the initial paint instead of an immediately-redundant refetch.
  const hasLayoutData = pendingLoaded && layoutPendingDisputes !== undefined;
  const [tab, setTab] = useState("pending");
  const [disputes, setDisputes] = useState(() => (hasLayoutData ? layoutPendingDisputes : []));
  const [loading, setLoading] = useState(!hasLayoutData);
  const [location, setLocation] = useState("all");
  const [search, setSearch] = useState("");
  const [department, setDepartment] = useState("all");
  const [issueType, setIssueType] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const skipNextLoad = useRef(hasLayoutData);

  const load = (silent) => {
    if (!silent) setLoading(true);
    api.get("/api/disputes", { params: { status: tab } }).then(({ data }) => setDisputes(data)).finally(() => setLoading(false));
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
    () => [...new Set(disputes.map((d) => d.hr_employees?.location).filter(Boolean))].sort(),
    [disputes],
  );
  const departments = useMemo(
    () => [...new Set(disputes.map((d) => d.hr_employees?.department).filter(Boolean))].sort(),
    [disputes],
  );
  const issueTypes = useMemo(() => [...new Set(disputes.map((d) => d.issue_type).filter(Boolean))].sort(), [disputes]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return disputes.filter((d) => {
      const e = d.hr_employees || {};
      if (location !== "all" && e.location !== location) return false;
      if (department !== "all" && e.department !== department) return false;
      if (issueType !== "all" && d.issue_type !== issueType) return false;
      if (dateFrom && d.date < dateFrom) return false;
      if (dateTo && d.date > dateTo) return false;
      if (q && !`${e.first_name || ""} ${e.last_name || ""} ${e.employee_code || ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [disputes, location, department, issueType, dateFrom, dateTo, search]);
  const hasFilters = search || location !== "all" || department !== "all" || issueType !== "all" || dateFrom || dateTo;
  const clearFilters = () => { setSearch(""); setLocation("all"); setDepartment("all"); setIssueType("all"); setDateFrom(""); setDateTo(""); };
  const inputCls = "rounded-sm border border-ink/15 bg-paper px-4 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Attendance disputes</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">Employee-reported missed punches</p>
        </div>
      </div>

      <SlidingTabs tabs={TABS} value={tab} onChange={setTab} className="flex gap-1 mb-4" />

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <input type="search" aria-label="Search employee" placeholder="Search name or employee code" value={search}
          onChange={(e) => setSearch(e.target.value)} className={`${inputCls} w-64`} />
        <select aria-label="Filter by department" value={department} onChange={(e) => setDepartment(e.target.value)} className={inputCls}>
          <option value="all">All departments</option>
          {departments.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select aria-label="Filter by location" value={location} onChange={(e) => setLocation(e.target.value)} className={inputCls}>
          <option value="all">All locations</option>
          {locations.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <select aria-label="Filter by issue" value={issueType} onChange={(e) => setIssueType(e.target.value)} className={inputCls}>
          <option value="all">All issues</option>
          {issueTypes.map((x) => <option key={x} value={x}>{x.replace(/_/g, " ")}</option>)}
        </select>
        <label className="text-xs text-ink/70">From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={`${inputCls} ml-1`} /></label>
        <label className="text-xs text-ink/70">To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={`${inputCls} ml-1`} /></label>
        {hasFilters && <button onClick={clearFilters} className="text-sm text-jade-700 hover:underline pb-2">Clear filters</button>}
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left sticky top-0 z-10 bg-paper shadow-edge">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Employee</th>
              <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Location</th>
              <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Date</th>
              <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Issue</th>
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Confirm times</th>}
              {tab === "pending" && <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Action</th>}
              {tab !== "pending" && <th className="px-5 py-3 font-semibold text-[11px] text-ink/70">Status</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={6}>Loading ledger…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6}><EmptyState title={hasFilters ? "No disputes match these filters" : `No ${tab} disputes`} action={hasFilters ? { label: "Clear filters", onClick: clearFilters } : tab !== "pending" ? { label: "Show pending disputes", onClick: () => setTab("pending") } : { label: "Open attendance report", to: "/admin/reports/attendance" }}>{hasFilters ? "Try widening the search or removing a filter." : tab === "pending" ? "Employees report missed punches from their own attendance page." : `Disputes you ${tab} will be listed here.`}</EmptyState></td></tr>
            ) : tab === "pending" ? (
              filtered.map((d) => <ResolveRow key={d.id} dispute={d} onResolved={load} />)
            ) : (
              filtered.map((d) => (
                <tr key={d.id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{d.hr_employees?.first_name} {d.hr_employees?.last_name}</span>
                    <div className="text-xs text-ink/70 font-nums">{d.hr_employees?.employee_code}</div>
                  </td>
                  <td className="px-5 py-3.5 text-ink/70">{d.hr_employees?.location || "—"}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(d.date)}</td>
                  <td className="px-5 py-3.5 text-ink/70 max-w-xs">
                    {d.reason}
                    {(d.movement || []).length > 0 && (
                      <div className="text-[11px] text-ink/70 mt-1.5 border-l-2 border-jade-500 pl-2">
                        <span className="font-semibold">Geotag check-ins that day:</span>{" "}
                        {d.movement.map((m) => `${m.visit_type === "check_out" ? "out" : "in"} ${m.place || m.place_type} ${new Date(m.captured_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false })}`).join(" · ")}
                      </div>
                    )}
                    {d.photo_url && (
                      <a href={d.photo_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-jade-700 hover:underline mt-1">
                        <Paperclip size={11} /> {d.photo_filename || "Photo"}
                      </a>
                    )}
                    {d.admin_note && <p className="text-xs text-ink/70 mt-1.5"><strong>Decision note:</strong> {d.admin_note}</p>}
                    <DelayAndResponse dispute={d} />
                    <RespondBox dispute={d} onDone={() => load(true)} />
                  </td>
                  <td className="px-5 py-3.5"><StampBadge status={d.status}>{d.status}</StampBadge>{d.resolved_by_role && <div className="text-[11px] text-ink/60 mt-1">by {d.resolved_by_role === "manager" ? "reporting manager" : d.resolved_by_role === "ai" ? "AI policy review (auto)" : d.resolved_by_role === "policy" ? "attendance policy (auto)" : "HR"}</div>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
