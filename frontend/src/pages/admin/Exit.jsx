import { ArrowLeft, Check, CheckCircle2, Circle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const REASON_OPTIONS = [
  "Better opportunity", "Compensation", "Career growth", "Relocation", "Work environment",
  "Management/team issues", "Health/personal reasons", "Family reasons", "Retirement", "Other",
];
const YES_NO_MAYBE = ["Yes", "No", "Maybe"];

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

function InterviewSection({ record, onUpdated }) {
  const existing = record.interview;
  const [editing, setEditing] = useState(!existing);
  const [form, setForm] = useState(() => ({
    reasons_for_leaving: existing?.reasons_for_leaving || [],
    reason_other: existing?.reason_other || "",
    role_feedback: existing?.role_feedback || "",
    management_feedback: existing?.management_feedback || "",
    work_environment_feedback: existing?.work_environment_feedback || "",
    retention_insight: existing?.retention_insight || "",
    would_rejoin: existing?.would_rejoin || "",
    would_recommend: existing?.would_recommend || "",
    interviewee_signature: existing?.interviewee_signature || "",
    interviewer_signature: existing?.interviewer_signature || "",
  }));
  const [saving, setSaving] = useState(false);

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleReason = (r) =>
    setField("reasons_for_leaving", form.reasons_for_leaving.includes(r)
      ? form.reasons_for_leaving.filter((x) => x !== r)
      : [...form.reasons_for_leaving, r]);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/api/exit-records/${record.id}/interview`, form);
      onUpdated({ ...record, interview: data });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/70">Employee Exit Interview</p>
        {!editing && <button onClick={() => setEditing(true)} className="text-xs text-jade-600 hover:underline">Edit</button>}
      </div>

      {!editing ? (
        existing ? (
          <div className="space-y-3 text-sm text-ink/80">
            <p><strong>Reasons for leaving:</strong> {existing.reasons_for_leaving.join(", ") || "—"}{existing.reason_other ? ` (${existing.reason_other})` : ""}</p>
            <p><strong>Role/performance feedback:</strong> {existing.role_feedback || "—"}</p>
            <p><strong>Management/team feedback:</strong> {existing.management_feedback || "—"}</p>
            <p><strong>Work environment feedback:</strong> {existing.work_environment_feedback || "—"}</p>
            <p><strong>Retention insight:</strong> {existing.retention_insight || "—"}</p>
            <p><strong>Would rejoin:</strong> {existing.would_rejoin || "—"} &nbsp; <strong>Would recommend:</strong> {existing.would_recommend || "—"}</p>
            <p className="text-xs text-ink/50">Submitted {formatDate(existing.submitted_at)}</p>
          </div>
        ) : (
          <p className="text-sm text-ink/70">Not yet conducted.</p>
        )
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Reason(s) for leaving</label>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {REASON_OPTIONS.map((r) => (
                <label key={r} className="flex items-center gap-1.5 text-sm text-ink cursor-pointer">
                  <input type="checkbox" checked={form.reasons_for_leaving.includes(r)} onChange={() => toggleReason(r)} className="rounded border-ink/30 text-jade-600 focus:ring-jade-500" />
                  {r}
                </label>
              ))}
            </div>
            {form.reasons_for_leaving.includes("Other") && (
              <input className={`${inputCls} mt-2`} placeholder="Please specify" value={form.reason_other} onChange={(e) => setField("reason_other", e.target.value)} />
            )}
          </div>
          {[
            ["role_feedback", "Role & Performance Experience"],
            ["management_feedback", "Management & Team Feedback"],
            ["work_environment_feedback", "Work Environment & Organization"],
            ["retention_insight", "Retention Insight (what could have kept you?)"],
          ].map(([key, label]) => (
            <div key={key}>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">{label}</label>
              <textarea className={`${inputCls} min-h-[60px]`} value={form[key]} onChange={(e) => setField(key, e.target.value)} />
            </div>
          ))}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Would rejoin JADE?</label>
              <select className={inputCls} value={form.would_rejoin} onChange={(e) => setField("would_rejoin", e.target.value)}>
                <option value="">—</option>
                {YES_NO_MAYBE.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Would recommend JADE?</label>
              <select className={inputCls} value={form.would_recommend} onChange={(e) => setField("would_recommend", e.target.value)}>
                <option value="">—</option>
                {YES_NO_MAYBE.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Interviewee signature (typed name)</label>
              <input className={inputCls} value={form.interviewee_signature} onChange={(e) => setField("interviewee_signature", e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Interviewer signature (typed name)</label>
              <input className={inputCls} value={form.interviewer_signature} onChange={(e) => setField("interviewer_signature", e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            {existing && <button onClick={() => setEditing(false)} className="text-sm text-ink/70 hover:text-ink px-2">Cancel</button>}
            <button
              onClick={save} disabled={saving}
              className="bg-ledger-800 text-manila px-4 py-2 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Save Interview"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ExitDetail({ id }) {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    api.get(`/api/exit-records/${id}`).then(({ data }) => setRecord(data)).finally(() => setLoading(false));
  };
  useEffect(load, [id]);

  const finalize = async () => {
    if (!window.confirm("Finalize this exit? This marks the employee as Exited and locks the checklist.")) return;
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

  if (loading) return <p className="text-ink/70">Loading…</p>;
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
        <table className="w-full text-sm">
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
      <InterviewSection record={record} onUpdated={(updated) => setRecord(updated)} />

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

function InitiateExitModal({ onClose, onCreated }) {
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [resignationDate, setResignationDate] = useState("");
  const [lastWorkingDay, setLastWorkingDay] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get("/api/employees", { params: { lite: true } }).then(({ data }) => {
      setEmployees(data.filter((e) => e.is_active).sort((a, b) => `${a.first_name} ${a.last_name || ""}`.localeCompare(`${b.first_name} ${b.last_name || ""}`)));
    });
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
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
            <select required className={inputCls} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">Select an employee…</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.employee_code} — {e.first_name} {e.last_name}</option>
              ))}
            </select>
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

  const load = () => {
    setLoading(true);
    api.get("/api/exit-records", { params: { status: tab } }).then(({ data }) => setRecords(data)).finally(() => setLoading(false));
  };
  useEffect(load, [tab]);

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-display text-2xl text-ink">Exit Procedure</h2>
        <button
          onClick={() => setShowModal(true)}
          className="bg-ledger-800 text-manila px-4 py-2 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
        >
          Initiate Exit
        </button>
      </div>
      <p className="text-sm text-ink/70 mb-6">Departmental clearance checklist and exit interview, matching the Final Settlement Form.</p>

      <div className="flex gap-1 mb-4">
        {[["in_progress", "In Progress"], ["completed", "Completed"]].map(([key, label]) => (
          <button
            key={key} onClick={() => setTab(key)}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${tab === key ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center">Loading…</td></tr>
            ) : records.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center">No {tab === "in_progress" ? "exits in progress" : "completed exits"}.</td></tr>
            ) : (
              records.map((r) => (
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
