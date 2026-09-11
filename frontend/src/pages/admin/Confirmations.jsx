import { CalendarCheck, Check, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const TABS = [
  { key: "due", label: "Due for confirmation" },
  { key: "unset", label: "No probation date set" },
  { key: "confirmed", label: "Confirmed" },
];

const inputCls =
  "rounded-sm border border-ink/15 bg-manila/40 px-2 py-1.5 text-xs font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

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
  const [busy, setBusy] = useState(false);
  const [extendTo, setExtendTo] = useState("");

  const confirm = async () => {
    if (!window.confirm(`Confirm ${row.name}'s employment? This records today as their confirmation date.`)) return;
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
          <input type="date" value={extendTo} onChange={(e) => setExtendTo(e.target.value)} className={inputCls} />
          <button
            onClick={extend}
            disabled={busy || !extendTo}
            className="border border-ink/15 text-ink/80 px-2.5 py-1.5 rounded-sm text-xs font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            Extend
          </button>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <button
          onClick={confirm}
          disabled={busy}
          className="flex items-center gap-1.5 bg-jade-600 text-white px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          <Check size={13} /> Confirm
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
          <input type="date" value={probationDate} onChange={(e) => setProbationDate(e.target.value)} className={inputCls} />
          <button
            onClick={save}
            disabled={busy || !probationDate}
            className="bg-ledger-800 text-manila px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-ledger-700 disabled:opacity-40 transition-colors whitespace-nowrap"
          >
            {busy ? "Saving…" : "Set date"}
          </button>
        </div>
      </td>
    </tr>
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

  useEffect(load, [tab]);

  const headers = {
    due: ["Employee", "Joined", "Probation ends", "Extend probation", ""],
    unset: ["Employee", "Joined", "Type", "Set probation completion date"],
    confirmed: ["Employee", "Joined", "Probation ended", "Confirmed on"],
  }[tab];

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <CalendarCheck size={20} className="text-jade-600" />
        <h2 className="font-display text-2xl text-ink">Probation &amp; Confirmation</h2>
      </div>
      <p className="text-sm text-ink/70 mb-6">
        Who is due to be confirmed after probation, and confirming them. Setting a confirmation date here clears the
        employee off the Dashboard's "Probation Ending" clock. The letter itself comes from{" "}
        <Link to="/admin/letters" className="text-jade-600 hover:underline">Letters → Confirmation Letter</Link>.
      </p>

      <div className="flex flex-wrap gap-1 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
              tab === t.key ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "unset" && (
        <p className="text-xs text-ink/70 bg-manila border-l-2 border-ochre-700 px-4 py-2.5 mb-4 flex items-start gap-2">
          <FileText size={13} className="mt-0.5 flex-shrink-0" />
          Joiners in the last ~9 months with no probation completion date recorded. Per the offer letter probation
          runs 90 <em>working</em> days (leave excluded), so the date is set per employee rather than calculated.
          Until a date is set here, nobody appears in "Due for confirmation" or on the Dashboard clock.
        </p>
      )}

      <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr className="border-b-2 border-ink/10">
              {headers.map((h, i) => (
                <th key={i} className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={headers.length}>Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr>
                <td className="px-5 py-8 text-ink/70 text-center" colSpan={headers.length}>
                  {tab === "due"
                    ? "Nobody is currently awaiting confirmation. If that looks wrong, check the \"No probation date set\" tab — someone with no date recorded never reaches this list."
                    : tab === "unset"
                      ? "Every recent joiner has a probation completion date on file."
                      : "Nobody has been confirmed yet."}
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
    </div>
  );
}
