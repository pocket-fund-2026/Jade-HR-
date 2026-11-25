import { CalendarCheck, Check, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import EmptyState from "../../components/EmptyState.jsx";
import { useConfirm } from "../../components/ConfirmDialog.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";
import SlidingTabs from "../../components/SlidingTabs.jsx";

const TABS = [
  { key: "due", label: "Due for confirmation" },
  { key: "unset", label: "No probation date set" },
  { key: "confirmed", label: "Confirmed" },
  { key: "backfill", label: "Backfill confirmed" },
];

const inputCls =
  "rounded-sm border border-ink/15 bg-manila/40 px-4 py-1.5 text-xs font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

function daysLabel(days) {
  if (days == null) return "—";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

function urgencyClass(days) {
  if (days == null) return "text-ink/60";
  if (days <= 3) return "text-rust-500";
  if (days <= 10) return "text-ochre-700";
  return "text-ink/60";
}

// Writes go through the employee profile endpoint the Employee page already
// uses — same permission, same validation, no second write path to keep in
// step with it.
function saveProfile(employeeId, patch) {
  return api.put(`/api/employees/${employeeId}/profile`, patch);
}

function DueRow({ row, onChanged }) {
  const askConfirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [extendTo, setExtendTo] = useState("");

  const confirm = async () => {
    if (!(await askConfirm(`Confirm ${row.name}'s employment? This records today as their confirmation date.`, { confirmLabel: "Confirm employment" }))) return;
    setBusy(true);
    try {
      await saveProfile(row.employee_id, { confirmation_date: new Date().toISOString().slice(0, 10) });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const extend = async () => {
    if (!extendTo) return;
    setBusy(true);
    try {
      await saveProfile(row.employee_id, { probation_completion_date: extendTo });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-ink/[0.06] last:border-0 align-top">
      <td className="px-5 py-3.5">
        <Link to={`/admin/employees/${row.employee_id}`} className="text-ink font-medium hover:text-jade-600 transition-colors">
          {row.name}
        </Link>
        <div className="text-xs text-ink/70 font-nums">{row.employee_code} · {row.department || "—"}</div>
      </td>
      <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(row.date_of_joining)}</td>
      <td className="px-5 py-3.5 font-nums text-ink/70">
        {formatDate(row.probation_completion_date)}
        <div className={`text-xs font-semibold ${urgencyClass(row.days_remaining)}`}>{daysLabel(row.days_remaining)}</div>
      </td>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-1.5">
          <input type="date" aria-label={`New probation end date for ${row.name}`} value={extendTo} onChange={(e) => setExtendTo(e.target.value)} className={inputCls} />
          <button
            onClick={extend}
            disabled={busy || !extendTo}
            className="border border-ink/15 text-ink/80 px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            Extend probation
          </button>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <button
          onClick={confirm}
          disabled={busy}
          className="flex items-center gap-1.5 bg-jade-600 text-white px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          <Check size={13} /> Confirm employment
        </button>
      </td>
    </tr>
  );
}

function UnsetRow({ row, onChanged }) {
  const [probationDate, setProbationDate] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!probationDate) return;
    setBusy(true);
    try {
      await saveProfile(row.employee_id, { probation_completion_date: probationDate });
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-ink/[0.06] last:border-0">
      <td className="px-5 py-3.5">
        <Link to={`/admin/employees/${row.employee_id}`} className="text-ink font-medium hover:text-jade-600 transition-colors">
          {row.name}
        </Link>
        <div className="text-xs text-ink/70 font-nums">{row.employee_code} · {row.department || "—"}</div>
      </td>
      <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(row.date_of_joining)}</td>
      <td className="px-5 py-3.5 text-ink/70">{row.employee_type || "—"}</td>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-1.5">
          <input type="date" aria-label={`Probation completion date for ${row.name}`} value={probationDate} onChange={(e) => setProbationDate(e.target.value)} className={inputCls} />
          <button
            onClick={save}
            disabled={busy || !probationDate}
            className="bg-ledger-800 text-manila px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-ledger-700 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {busy ? "Saving…" : "Save probation date"}
          </button>
        </div>
      </td>
    </tr>
  );
}

function BackfillPanel() {
  const askConfirm = useConfirm();
  const [days, setDays] = useState(126);
  const [rows, setRows] = useState(null);
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const preview = async () => {
    setBusy(true); setMsg("");
    try {
      const { data } = await api.get("/api/confirmations/backfill-preview", { params: { probation_days: days } });
      setRows(data.rows);
      setPicked(new Set(data.rows.map((r) => r.employee_id)));
    } catch { setMsg("Could not load the preview. Try again."); } finally { setBusy(false); }
  };
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const apply = async () => {
    if (!(await askConfirm(`Record a confirmation date for ${picked.size} people? Each gets the date shown in the table.`, { confirmLabel: "Confirm them" }))) return;
    setBusy(true);
    try {
      const { data } = await api.post("/api/confirmations/backfill", { employee_ids: [...picked], probation_days: days });
      setMsg(`Confirmed ${data.confirmed} people${data.skipped ? `, ${data.skipped} no longer eligible` : ""}.`);
      await preview();
    } catch (e) { setMsg(e?.response?.data?.detail || "Could not save. Nothing was changed for the failed rows, reload and try again."); setBusy(false); }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink/70 bg-manila border-l-2 border-ochre-700 px-4 py-2.5">
        For people who joined long ago and were never given a confirmation date, so they still show as On Probation
        everywhere. The date is proposed from the recorded probation end, or from joining date plus the days below.
        The offer letter sets the real date per person, so check the list. Nothing is saved until you press Confirm.
      </p>
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-xs text-ink/70">Probation length (calendar days)
          <input type="number" min={30} max={730} value={days} onChange={(e) => setDays(Number(e.target.value) || 126)} className={`${inputCls} block w-28 mt-1`} />
        </label>
        <button onClick={preview} disabled={busy} className="rounded-sm bg-jade-500 text-white px-4 py-2 text-sm disabled:opacity-50">{rows ? "Refresh preview" : "Preview confirmations"}</button>
        {rows && picked.size > 0 && (
          <button onClick={apply} disabled={busy} className="rounded-sm bg-ledger-900 text-manila px-4 py-2 text-sm disabled:opacity-50">Confirm {picked.size} selected</button>
        )}
        {msg && <span className="text-sm text-ink">{msg}</span>}
      </div>
      {rows && (
        <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-left"><tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3"><input type="checkbox" aria-label="Select all" className="accent-jade-600"
                checked={rows.length > 0 && picked.size === rows.length}
                onChange={(e) => setPicked(e.target.checked ? new Set(rows.map((r) => r.employee_id)) : new Set())} /></th>
              {["Employee", "Type", "Joined", "Will be confirmed on", "Based on"].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold text-[11px] text-ink/70">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6}><EmptyState title="Nobody needs backfilling" action={{ label: "Open employees", to: "/admin/employees" }}>Everyone already has a confirmation date at this probation length.</EmptyState></td></tr>}
              {rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-4 py-3"><input type="checkbox" className="accent-jade-600" checked={picked.has(r.employee_id)} onChange={() => toggle(r.employee_id)} aria-label={`Select ${r.name}`} /></td>
                  <td className="px-4 py-3"><Link to={`/admin/employees/${r.employee_id}`} className="text-ink font-medium hover:text-jade-600">{r.name}</Link>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code} · {r.department || "—"}</div></td>
                  <td className="px-4 py-3 text-ink/70">{r.employee_type || "—"}</td>
                  <td className="px-4 py-3 text-ink/70">{formatDate(r.date_of_joining)}</td>
                  <td className="px-4 py-3 text-jade-700">{formatDate(r.proposed_confirmation_date)}</td>
                  <td className="px-4 py-3 text-xs text-ink/60">{r.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function Confirmations() {
  const [tab, setTab] = useState("due");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/api/confirmations", { params: { status: tab } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => { if (tab !== "backfill") load(); }, [tab]);

  const headers = {
    due: ["Employee", "Joined", "Probation ends", "Extend probation", ""],
    unset: ["Employee", "Joined", "Type", "Set probation completion date"],
    confirmed: ["Employee", "Joined", "Probation ended", "Confirmed on"],
    backfill: [],
  }[tab];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <CalendarCheck size={20} className="text-jade-600" />
        <h2 className="font-display text-2xl text-ink">Probation &amp; Confirmation</h2>
      </div>
      <p className="text-sm text-ink/70 mb-6">
        Who is due to be confirmed after probation, and confirming them. Setting a confirmation date here clears the
        employee off the Dashboard’s "Probation Ending" clock. The letter itself comes from{" "}
        <Link to="/admin/letters" className="text-jade-600 hover:underline">Letters → Confirmation Letter</Link>.
      </p>

      <SlidingTabs tabs={TABS} value={tab} onChange={setTab} className="flex flex-wrap gap-1 mb-4" />

      {tab === "unset" && (
        <p className="text-xs text-ink/70 bg-manila border-l-2 border-ochre-700 px-4 py-2.5 mb-4 flex items-start gap-2">
          <FileText size={13} className="mt-0.5 flex-shrink-0" />
          Joiners in the last ~9 months with no probation completion date recorded. Per the offer letter probation
          runs 90 <em>working</em> days (leave excluded), so the date is set per employee rather than calculated.
          Until a date is set here, nobody appears in "Due for confirmation" or on the Dashboard clock.
        </p>
      )}

      {tab === "backfill" ? <BackfillPanel /> : (
      <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left">
            <tr className="border-b-2 border-ink/10">
              {headers.map((h, i) => (
                <th key={i} className="px-5 py-3 font-semibold text-[11px] text-ink/70">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={headers.length}><span className="t-shimmer" data-text="Loading…">Loading…</span></td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={headers.length}>
                  {tab === "due" ? (
                    <EmptyState title="Nobody is awaiting confirmation" action={{ label: "Check people with no probation date", onClick: () => setTab("unset") }}>
                      Someone with no date recorded never reaches this list.
                    </EmptyState>
                  ) : tab === "unset" ? (
                    <EmptyState title="No missing probation dates" action={{ label: "Back to due confirmations", onClick: () => setTab("due") }}>
                      Every recent joiner has a probation completion date on file.
                    </EmptyState>
                  ) : (
                    <EmptyState title="Nobody has been confirmed yet" action={{ label: "Back to due confirmations", onClick: () => setTab("due") }}>
                      Confirmed employees are listed here.
                    </EmptyState>
                  )}
                </td>
              </tr>
            ) : tab === "due" ? (
              rows.map((r) => <DueRow key={r.employee_id} row={r} onChanged={load} />)
            ) : tab === "unset" ? (
              rows.map((r) => <UnsetRow key={r.employee_id} row={r} onChanged={load} />)
            ) : (
              rows.map((r) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    <Link to={`/admin/employees/${r.employee_id}`} className="text-ink font-medium hover:text-jade-600 transition-colors">
                      {r.name}
                    </Link>
                    <div className="text-xs text-ink/70 font-nums">{r.employee_code} · {r.department || "—"}</div>
                  </td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(r.date_of_joining)}</td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatDate(r.probation_completion_date)}</td>
                  <td className="px-5 py-3.5 font-nums text-jade-700">{formatDate(r.confirmation_date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
