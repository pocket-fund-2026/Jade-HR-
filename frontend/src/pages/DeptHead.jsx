import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../lib/auth.jsx";

import EmptyState from "../components/EmptyState.jsx";
import SlidingTabs from "../components/SlidingTabs.jsx";
import StampBadge from "../components/StampBadge.jsx";
import api from "../lib/api.js";
import { formatDate } from "../lib/format.js";

const KINDS = [
  { key: "disputes", label: "Disputes" },
  { key: "leave", label: "Leave" },
  { key: "absence", label: "Work absence" },
];

function who(r) {
  const e = r.hr_employees || r;
  return { name: `${e.first_name || ""} ${e.last_name || ""}`.trim(), code: e.employee_code };
}

function Row({ kind, r, onDone }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const w = who(r);
  const to = r.status === "approved" ? "reject" : "approve";
  const day = kind === "disputes" ? formatDate(r.date) : `${formatDate(r.start_date)}–${formatDate(r.end_date)}`;
  const what = kind === "disputes" ? `${(r.issue_type || "").replace(/_/g, " ")}: ${r.reason}` : kind === "leave" ? `${r.leave_type}: ${r.reason}` : r.details;
  const go = async () => {
    setBusy(true);
    setError("");
    try {
      await api.put(`/api/dept-head/${kind}/${r.id}`, { action: to, note });
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not change it");
    } finally {
      setBusy(false);
    }
  };
  return (
    <tr className="border-t border-ink/[0.06] align-top">
      <td className="px-4 py-3"><span className="text-ink font-medium">{w.name}</span><div className="text-xs text-ink/70 font-nums">{w.code}</div></td>
      <td className="px-4 py-3 font-nums text-ink/70 whitespace-nowrap">{day}</td>
      <td className="px-4 py-3 text-ink/70 max-w-sm">
        {what}
        {r.admin_note && <p className="text-xs text-ink/60 mt-1">Note: {r.admin_note}</p>}
      </td>
      <td className="px-4 py-3"><StampBadge status={r.status}>{r.status}</StampBadge></td>
      <td className="px-4 py-3 min-w-[14rem]">
        {!open ? (
          <button type="button" onClick={() => setOpen(true)} className="text-xs text-jade-700 hover:underline">
            Change to {to === "approve" ? "approved" : "rejected"}
          </button>
        ) : (
          <div className="space-y-2">
            <textarea aria-label="Reason for the change" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason for the change"
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-xs min-h-[56px] focus:outline-none focus:ring-2 focus:ring-jade-500" />
            {error && <p className="text-xs text-rust-500">{error}</p>}
            <div className="flex items-center gap-3">
              <button type="button" disabled={busy || note.trim().length < 3} onClick={go}
                className="bg-ledger-800 text-manila px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-ledger-700 disabled:opacity-50">
                {busy ? "Saving…" : `Confirm: ${to === "approve" ? "approve" : "reject"}`}
              </button>
              <button type="button" onClick={() => setOpen(false)} className="text-xs text-ink/70 hover:text-ink">Cancel</button>
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}

function HeadsManager() {
  const [emps, setEmps] = useState([]);
  const [heads, setHeads] = useState(new Set());
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");
  const load = () => {
    api.get("/api/dept-head/proposals").then(({ data }) => setHeads(new Set(data.current_heads))).catch(() => {});
    api.get("/api/employees", { params: { lite: true } }).then(({ data }) => setEmps(data.filter((e) => e.is_active))).catch(() => {});
  };
  useEffect(load, []);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = emps.filter((e) => heads.has(e.id) || (t && `${e.first_name} ${e.last_name} ${e.employee_code} ${e.department}`.toLowerCase().includes(t)));
    return list.sort((a, b) => (heads.has(b.id) - heads.has(a.id)) || (a.department || "").localeCompare(b.department || "")).slice(0, 40);
  }, [emps, heads, q]);
  const toggle = async (e) => {
    setMsg("");
    try {
      await api.post("/api/dept-head/set", { employee_ids: [e.id], head: !heads.has(e.id) });
      load();
    } catch (err) { setMsg(err.response?.data?.detail || "Could not change"); }
  };
  return (
    <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
      <p className="text-xs font-semibold text-ink/70 mb-1">Department heads</p>
      <p className="text-xs text-ink/60 mb-3">A head can change decisions for everyone whose department matches theirs exactly. Search a person to make them a head, or untick to remove.</p>
      <input type="search" aria-label="Search employees" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, code or department"
        className="w-72 rounded-sm border border-ink/15 bg-paper px-3 py-1.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-jade-500" />
      {shown.map((e) => (
        <label key={e.id} className="flex items-center gap-2 text-sm text-ink py-0.5">
          <input type="checkbox" checked={heads.has(e.id)} onChange={() => toggle(e)} />
          {e.first_name} {e.last_name} <span className="text-xs text-ink/60 font-nums">{e.employee_code}</span>
          <span className="text-xs text-ink/60">· {e.department || "no department"}</span>
        </label>
      ))}
      {!shown.length && <p className="text-xs text-ink/60">No heads set yet. Search to add one.</p>}
      {msg && <p className="text-xs text-rust-500 mt-2">{msg}</p>}
    </div>
  );
}

export default function DeptHead() {
  const { user } = useAuth() || {};
  const [kind, setKind] = useState("disputes");
  const [info, setInfo] = useState(null);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const load = () => {
    setError("");
    api.get("/api/dept-head/items", { params: { kind } }).then(({ data }) => setRows(data)).catch((e) => setError(e.response?.data?.detail || "Could not load"));
  };
  useEffect(() => { api.get("/api/dept-head/status").then(({ data }) => setInfo(data)).catch(() => {}); }, []);
  useEffect(() => { setRows(null); load(); }, [kind]);

  return (
    <div>
      <h2 className="font-display text-2xl text-ink">Change decisions</h2>
      <p className="text-xs text-ink/70 mt-0.5 mb-5">
        Disputes, leave and work absences that have already been approved or rejected, in the last 120 days. You can change an approval to a rejection, or a rejection to an approval, whenever it is needed. A reason is required and the person is told by email. Reporting managers see their team, department heads their department, HR and Accounts everyone.
      </p>
      {(user?.role === "accounts" || user?.role === "hr") && <HeadsManager />}
      <SlidingTabs tabs={KINDS} value={kind} onChange={setKind} className="flex gap-1 mb-4" />
      {error && <p className="text-sm text-rust-500 mb-3">{error}</p>}
      <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] text-ink/60"><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Request</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Change</th></tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-ink/70">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={5}><EmptyState title="Nothing decided yet">Decided items for your department show here.</EmptyState></td></tr>
            ) : rows.map((r) => <Row key={r.id} kind={kind} r={r} onDone={load} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
