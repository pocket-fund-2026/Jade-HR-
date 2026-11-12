import { ArrowLeft, Check, CheckCircle2, Circle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { useConfirm } from "../../components/ConfirmDialog.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const inputCls =
  "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

function ChecklistRow({ item, exitId, onUpdated }) {
  const [signedBy, setSignedBy] = useState(item.signed_by || "");
  const [notes, setNotes] = useState(item.notes || "");
  const [busy, setBusy] = useState(false);

  const save = async (status) => {
    setBusy(true);
    try {
      const { data } = await api.put(`/api/exit-records/${exitId}/checklist/${item.id}`, {
        status, signed_by: signedBy, notes,
      });
      onUpdated(data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr className="border-b border-ink/[0.06] last:border-0 align-top">
      <td className="px-4 py-3 text-ink font-medium whitespace-nowrap">{item.department}</td>
      <td className="px-4 py-3 text-ink/70 whitespace-nowrap">{item.item_label}</td>
      <td className="px-4 py-3">
        <input
          value={signedBy}
          onChange={(e) => setSignedBy(e.target.value)}
          onBlur={() => item.status === "completed" && save("completed")}
          placeholder="Signed by…"
          className={`${inputCls} w-36`}
        />
      </td>
      <td className="px-4 py-3">
        <input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => item.status === "completed" && save("completed")}
          placeholder="Notes (optional)"
          className={`${inputCls} w-48`}
        />
      </td>
      <td className="px-4 py-3">
        {item.status === "completed" ? (
          <button
            type="button" disabled={busy} onClick={() => save("pending")}
            className="flex items-center gap-1.5 text-xs font-semibold text-jade-600 hover:text-jade-700"
          >
            <CheckCircle2 size={15} /> Completed
          </button>
        ) : (
          <button
            type="button" disabled={busy} onClick={() => save("completed")}
            className="flex items-center gap-1.5 text-xs font-semibold text-ink/70 hover:text-ink"
          >
            <Circle size={15} /> Mark complete
          </button>
        )}
        {item.signed_at && <div className="text-[10px] text-ink/50 mt-0.5">{formatDate(item.signed_at)}</div>}
      </td>
    </tr>
  );
}

function AssetSection({ record, onUpdated }) {
  const [systemNo, setSystemNo] = useState(record.system_no || "");
  const flags = [
    ["monitor_returned", "Monitor returned"],
    ["keyboard_returned", "Keyboard returned"],
    ["mouse_returned", "Mouse returned"],
    ["system_password_reset", "System password reset"],
    ["email_password_reset", "Email password reset"],
  ];

  const toggle = async (key, value) => {
    const { data } = await api.put(`/api/exit-records/${record.id}`, { [key]: value });
    onUpdated(data);
  };

  const saveSystemNo = async () => {
    if (systemNo === (record.system_no || "")) return;
    const { data } = await api.put(`/api/exit-records/${record.id}`, { system_no: systemNo });
    onUpdated(data);
  };

  return (
    <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-3">Asset & Access Return</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">System No.</label>
          <input value={systemNo} onChange={(e) => setSystemNo(e.target.value)} onBlur={saveSystemNo} className={inputCls} />
        </div>
        <div className="flex flex-col gap-2 justify-center">
          {flags.map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-ink cursor-pointer">
              <input
                type="checkbox" checked={!!record[key]}
                onChange={(e) => toggle(key, e.target.checked)}
                className="rounded border-ink/30 text-jade-600 focus:ring-jade-500"
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

// Read-only: the exit interview is filled in by the RESIGNING EMPLOYEE from
// their own dashboard (HR instruction, 10 Sept 2026 — "should be only filled
// by the employees who has resigned"), so HR sees the answers here but never
// types them. The only write path is POST /api/me/exit-interview.
function InterviewSection({ record }) {
  const existing = record.interview;
  return (
    <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-3">Employee Exit Interview</p>
      {existing ? (
        <div className="space-y-3 text-sm text-ink/80">
          <p><strong>Reasons for leaving:</strong> {(existing.reasons_for_leaving || []).join(", ") || "—"}{existing.reason_other ? ` (${existing.reason_other})` : ""}</p>
          <p><strong>Role/performance feedback:</strong> {existing.role_feedback || "—"}</p>
          <p><strong>Management/team feedback:</strong> {existing.management_feedback || "—"}</p>
          <p><strong>Work environment feedback:</strong> {existing.work_environment_feedback || "—"}</p>
          <p><strong>Retention insight:</strong> {existing.retention_insight || "—"}</p>
          <p><strong>Would rejoin:</strong> {existing.would_rejoin || "—"} &nbsp; <strong>Would recommend:</strong> {existing.would_recommend || "—"}</p>
          <p><strong>Signed:</strong> {existing.interviewee_signature || "—"}</p>
          <p className="text-xs text-ink/50">Submitted by the employee on {formatDate(existing.submitted_at)}</p>
        </div>
      ) : (
        <p className="text-sm text-ink/70">
          Not yet submitted. The employee fills this in from their own dashboard — an "Exit interview" prompt
          appears there for as long as this exit is in progress.
        </p>
      )}
    </div>
  );
}

function ExitDetail({ id }) {
  const confirm = useConfirm();
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    api.get(`/api/exit-records/${id}`).then(({ data }) => setRecord(data)).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const finalize = async () => {
    if (!(await confirm("Finalize this exit? This marks the employee as Exited and locks the checklist."))) return;
    setFinalizing(true);
    setError("");
    try {
      const { data } = await api.post(`/api/exit-records/${id}/finalize`);
      setRecord((r) => ({ ...r, ...data }));
    } catch (err) {
      setError(err.response?.data?.detail || "Could not finalize");
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) return <p className="text-ink/70"><span className="t-shimmer" data-text="Loading…">Loading…</span></p>;
  if (!record) return <p className="text-ink/70">Exit record not found.</p>;

  const emp = record.employee || {};
  const completedCount = record.checklist.filter((i) => i.status === "completed").length;

  return (
    <div>
      <Link to="/admin/exit" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors mb-4">
        <ArrowLeft size={13} /> Back to Exit Procedure
      </Link>

      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">{emp.first_name} {emp.last_name}</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">
            {emp.employee_code} · {emp.department || "—"} · Resigned {formatDate(record.resignation_date)} · Last day {formatDate(record.last_working_day)}
          </p>
        </div>
        <StampBadge status={record.status === "completed" ? "approved" : "pending"}>
          {record.status === "completed" ? "Completed" : "In Progress"}
        </StampBadge>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-ink/10 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">
            Departmental Clearance ({completedCount}/{record.checklist.length})
          </p>
        </div>
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left">
            <tr className="border-b border-ink/10">
              <th className="px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Department</th>
              <th className="px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Item</th>
              <th className="px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Signed By</th>
              <th className="px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Notes</th>
              <th className="px-4 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>
            </tr>
          </thead>
          <tbody>
            {record.checklist.map((item) => (
              <ChecklistRow
                key={item.id} item={item} exitId={record.id}
                onUpdated={(updated) => setRecord(updated)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <AssetSection record={record} onUpdated={(updated) => setRecord(updated)} />
      <InterviewSection record={record} />

      {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mb-4">{error}</p>}

      {record.status !== "completed" && (
        <div className="flex items-center justify-between bg-manila border border-ink/15 rounded-sm px-5 py-4">
          <p className="text-sm text-ink/70">
            {record.all_completed
              ? "All departments have signed off. Ready for Final Authorization."
              : `${record.checklist.length - completedCount} department(s) still pending.`}
          </p>
          <button
            onClick={finalize}
            disabled={!record.all_completed || finalizing}
            className="flex items-center gap-2 bg-jade-600 text-white px-4 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-40 transition-colors"
          >
            <Check size={15} /> {finalizing ? "Finalizing…" : "Final Authorization"}
          </button>
        </div>
      )}
      {record.status === "completed" && (
        <div className="bg-manila border border-ink/15 rounded-sm px-5 py-4 text-sm text-ink/70">
          Exit finalized {formatDate(record.completed_at)}. Generate the Relieving Letter from the{" "}
          <Link to="/admin/letters" className="text-jade-600 hover:underline">Letters</Link> page for this employee.
        </div>
      )}
    </div>
  );
}

function InitiateExitModal({ onClose, onCreated, initial = null }) {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState(initial?.employeeId || "");
  const [resignationDate, setResignationDate] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState(initial?.lastWorkingDay || "");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/employees", { params: { lite: true } }).then(({ data }) => {
      setEmployees(data.filter((e) => e.is_active).sort((a, b) => `${a.first_name} ${a.last_name || ""}`.localeCompare(`${b.first_name} ${b.last_name || ""}`)));
    });
  }, []);

  const selected = employees.find((e) => e.id === employeeId) || null;
  const matches = useMemo(() => {
    const words = search.toLowerCase().split(/\s+/).filter(Boolean);
    return employees
      .filter((e) => {
        const hay = `${e.employee_code} ${e.first_name} ${e.last_name || ""} ${e.department || ""}`.toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .slice(0, 60);
  }, [employees, search]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!employeeId) { setError("Pick an employee first"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/api/exit-records", {
        employee_id: employeeId, resignation_date: resignationDate, last_working_day: lastWorkingDay,
      });
      onCreated(data.id);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not initiate exit");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-md p-6 border-t-4 border-jade-500">
        <p className="font-display text-lg text-ink mb-5">Initiate Exit</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Employee</label>
            {selected ? (
              <div className="flex items-center justify-between rounded-sm border border-jade-500/40 bg-jade-50 px-3 py-2 text-sm text-ink">
                <span><span className="font-nums">{selected.employee_code}</span> — {selected.first_name} {selected.last_name}{selected.department ? ` · ${selected.department}` : ""}</span>
                <button type="button" onClick={() => { setEmployeeId(""); setSearch(""); }} className="text-xs text-ink/60 hover:text-ink">Change</button>
              </div>
            ) : (
              <>
                <input
                  autoFocus value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, code or department…" className={inputCls}
                />
                <div className="mt-1.5 max-h-48 overflow-y-auto rounded-sm border border-ink/10 bg-paper">
                  {matches.length === 0 ? (
                    <p className="px-3 py-3 text-xs text-ink/60">No active employee matches “{search}”.</p>
                  ) : matches.map((e) => (
                    <button
                      type="button" key={e.id} onClick={() => setEmployeeId(e.id)}
                      className="block w-full text-left px-3 py-2 text-sm hover:bg-manila/60 border-b border-ink/[0.06] last:border-0"
                    >
                      <span className="font-nums text-ink/70">{e.employee_code}</span> — <span className="text-ink">{e.first_name} {e.last_name}</span>
                      {e.department ? <span className="text-xs text-ink/60"> · {e.department}</span> : null}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Resignation Date</label>
              <input type="date" required className={`${inputCls} font-nums`} value={resignationDate} onChange={(e) => setResignationDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Last Working Day</label>
              <input type="date" required className={`${inputCls} font-nums`} value={lastWorkingDay} onChange={(e) => setLastWorkingDay(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-ink/70 hover:text-ink px-2">Cancel</button>
            <button type="submit" disabled={busy} className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors">
              {busy ? "Starting…" : "Start Exit Process"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ExitList() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("in_progress");
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [prefill, setPrefill] = useState(null);
  const [soon, setSoon] = useState([]);
  const [q, setQ] = useState("");

  const load = () => {
    setLoading(true);
    api.get("/api/exit-records", { params: { status: tab } }).then(({ data }) => setRecords(data)).finally(() => setLoading(false));
  };
  useEffect(load, [tab]);
  useEffect(() => {
    api.get("/api/exit-records/exiting-soon").then(({ data }) => setSoon(data)).catch(() => setSoon([]));
  }, []);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? records.filter((r) => `${r.employee?.employee_code} ${r.employee?.first_name} ${r.employee?.last_name || ""} ${r.employee?.department || ""}`.toLowerCase().includes(needle))
    : records;

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-display text-2xl text-ink">Exit Procedure</h2>
        <button
          onClick={() => { setPrefill(null); setShowModal(true); }}
          className="bg-ledger-800 text-manila px-4 py-2 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
        >
          Initiate Exit
        </button>
      </div>
      <p className="text-sm text-ink/70 mb-6">Departmental clearance checklist and exit interview, matching the Final Settlement Form.</p>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-ink/10 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Exiting Soon ({soon.length})</p>
          <p className="text-[11px] text-ink/50">Everyone with a Scheduled Exit Date or Exit Date on their profile who hasn't exited yet</p>
        </div>
        {soon.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink/60">Nobody is scheduled to leave. Set a Scheduled Exit Date on an employee's profile and they appear here.</p>
        ) : (
          <table className="w-full text-sm tabular-nums">
            <tbody>
              {soon.map((r) => {
                const days = r.exit_on ? Math.round((new Date(r.exit_on) - new Date(new Date().toISOString().slice(0, 10))) / 86400000) : null;
                return (
                  <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0">
                    <td className="px-5 py-3">
                      <span className="text-ink font-medium">{r.employee.first_name} {r.employee.last_name}</span>
                      <div className="text-xs text-ink/70 font-nums">{r.employee.employee_code} · {r.employee.department || "—"}</div>
                    </td>
                    <td className="px-5 py-3 text-ink/70 font-nums">
                      {r.exit_date ? "Exit date" : "Scheduled exit"} {formatDate(r.exit_on)}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold ${r.overdue ? "text-rust-500" : "text-ink/70"}`}>
                        {days === null ? "" : r.overdue ? `${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} overdue` : days === 0 ? "Today" : `in ${days} day${days === 1 ? "" : "s"}`}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {r.exit_id ? (
                        <button onClick={() => navigate(`/admin/exit/${r.exit_id}`)} className="text-xs font-semibold text-jade-600 hover:text-jade-700">Open exit →</button>
                      ) : (
                        <button
                          onClick={() => { setPrefill({ employeeId: r.employee_id, lastWorkingDay: r.exit_on || "" }); setShowModal(true); }}
                          className="text-xs font-semibold text-ledger-800 hover:underline"
                        >
                          Start exit process
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex gap-1 mb-4">
        {[["in_progress", "In Progress"], ["completed", "Completed"]].map(([key, label]) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${tab === key ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name, code or department…"
          className={`${inputCls} ml-auto max-w-xs`}
        />
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden">
        <table className="w-full text-sm tabular-nums">
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm"><span className="t-shimmer" data-text="Loading…">Loading…</span></td></tr>
            ) : shown.length === 0 ? (
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm">{needle ? "No exits match that filter." : `No ${tab === "in_progress" ? "exits in progress" : "completed exits"}.`}</td></tr>
            ) : (
              shown.map((r) => (
                <tr key={r.id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/30 cursor-pointer" onClick={() => navigate(`/admin/exit/${r.id}`)}>
                  <td className="px-5 py-3.5">
                    <span className="text-ink font-medium">{r.employee?.first_name} {r.employee?.last_name}</span>
                    <div className="text-xs text-ink/70 font-nums">{r.employee?.employee_code} · {r.employee?.department || "—"}</div>
                  </td>
                  <td className="px-5 py-3.5 text-ink/70 font-nums">Resigned {formatDate(r.resignation_date)}</td>
                  <td className="px-5 py-3.5 text-ink/70 font-nums">Last day {formatDate(r.last_working_day)}</td>
                  <td className="px-5 py-3.5"><StampBadge status={r.status === "completed" ? "approved" : "pending"}>{r.status === "completed" ? "Completed" : "In Progress"}</StampBadge></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <InitiateExitModal
          initial={prefill}
          onClose={() => setShowModal(false)}
          onCreated={(id) => { setShowModal(false); navigate(`/admin/exit/${id}`); }}
        />
      )}
    </div>
  );
}

export default function Exit() {
  const { id } = useParams();
  return id ? <ExitDetail id={id} /> : <ExitList />;
}
