import { BarChart3, Check, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../lib/api.js";
import { formatFullDate } from "../../lib/format.js";

const EMPTY = { title: "", description: "", assigned_to: "", due_date: "", priority: "normal" };

const PRIORITIES = [
  { value: "urgent", label: "Urgent", cls: "bg-rust-500/15 text-rust-500" },
  { value: "high", label: "High", cls: "bg-ochre-500/15 text-ochre-700" },
  { value: "normal", label: "Normal", cls: "bg-ink/[0.06] text-ink/60" },
  { value: "low", label: "Low", cls: "bg-ink/[0.04] text-ink/40" },
];
const PRIORITY_RANK = Object.fromEntries(PRIORITIES.map((p, i) => [p.value, i]));
const PRIORITY_META = Object.fromEntries(PRIORITIES.map((p) => [p.value, p]));

function PriorityBadge({ value }) {
  const meta = PRIORITY_META[value] || PRIORITY_META.normal;
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${meta.cls}`}>{meta.label}</span>;
}

// HR-team-only task list — gated by backend/auth.py's require_hr_role (role
// must literally be "hr"; Accounts does not see this section, see
// App.jsx's RequireHrRole and AdminLayout.jsx's hrOnly nav flag). Anyone on
// the HR team can create, reassign, reprioritize, or close any task — this
// is a shared team tracker, not per-person ownership.
export default function HrTasks() {
  const [tasks, setTasks] = useState([]);
  const [hrPeople, setHrPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [assignmentFilter, setAssignmentFilter] = useState("all"); // all | assigned | unassigned
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api.get("/api/hr-tasks", { params: filter === "all" ? undefined : { status: filter } })
      .then(({ data }) => setTasks(data))
      .finally(() => setLoading(false));
  };

  useEffect(load, [filter]);
  useEffect(() => {
    api.get("/api/employees", { params: { lite: true } })
      .then(({ data }) => setHrPeople(data.filter((e) => e.role === "hr" && e.is_active)))
      .catch(() => {});
  }, []);

  const visibleTasks = useMemo(() => {
    let rows = priorityFilter === "all" ? tasks : tasks.filter((t) => t.priority === priorityFilter);
    if (assignmentFilter === "assigned") rows = rows.filter((t) => t.assigned_to);
    if (assignmentFilter === "unassigned") rows = rows.filter((t) => !t.assigned_to);
    return [...rows].sort((a, b) => {
      if (a.status !== b.status) return a.status === "done" ? 1 : -1;
      const pr = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (pr !== 0) return pr;
      if (a.due_date && b.due_date) return a.due_date < b.due_date ? -1 : 1;
      if (a.due_date) return -1;
      if (b.due_date) return 1;
      return a.created_at < b.created_at ? 1 : -1;
    });
  }, [tasks, priorityFilter, assignmentFilter]);

  const startCreate = () => {
    setForm(EMPTY);
    setEditingId(null);
    setError("");
    setShowForm(true);
  };

  const startEdit = (task) => {
    setForm({
      title: task.title,
      description: task.description || "",
      assigned_to: task.assigned_to || "",
      due_date: task.due_date || "",
      priority: task.priority || "normal",
    });
    setEditingId(task.id);
    setError("");
    setShowForm(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim()) {
      setError("Enter a title");
      return;
    }
    const payload = {
      title: form.title,
      description: form.description,
      assigned_to: form.assigned_to || null,
      due_date: form.due_date || null,
      priority: form.priority,
    };
    try {
      if (editingId) await api.put(`/api/hr-tasks/${editingId}`, payload);
      else await api.post("/api/hr-tasks", payload);
      setForm(EMPTY);
      setEditingId(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save — try again");
    }
  };

  const toggleDone = async (task) => {
    const status = task.status === "done" ? "open" : "done";
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, status } : t)));
    try {
      await api.put(`/api/hr-tasks/${task.id}`, { status });
    } catch {
      load();
    }
  };

  const remove = async (task) => {
    if (!confirm(`Delete "${task.title}"?`)) return;
    await api.delete(`/api/hr-tasks/${task.id}`);
    load();
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="font-display text-2xl text-ink">HR Tasks</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">Shared to-do list for the HR team — anyone can assign, reassign, or close a task. Not visible to Accounts.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={assignmentFilter}
            onChange={(e) => setAssignmentFilter(e.target.value)}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            <option value="all">Assigned + Unassigned</option>
            <option value="assigned">Assigned only</option>
            <option value="unassigned">Unassigned only</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            <option value="all">All priorities</option>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <Link
            to="/admin/hr-tasks/report"
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-4 py-2.5 rounded-sm text-sm font-semibold hover:border-jade-500 transition-colors"
          >
            <BarChart3 size={16} /> Report
          </Link>
          <button
            onClick={startCreate}
            className="flex items-center gap-2 bg-ledger-800 text-manila px-4 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
          >
            <Plus size={16} /> New Task
          </button>
        </div>
      </div>

      <div className="flex gap-1 mb-4">
        {[["open", "Open"], ["done", "Done"], ["all", "All Tasks"]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-sm text-sm font-medium transition-colors ${
              filter === key ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-5 mb-6 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-jade-600">{editingId ? "Edit task" : "New task"}</p>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Title</label>
            <input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 min-h-[70px]"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Assign to</label>
              <select
                value={form.assigned_to}
                onChange={(e) => setForm((f) => ({ ...f, assigned_to: e.target.value }))}
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              >
                <option value="">Unassigned</option>
                {hrPeople.map((p) => (
                  <option key={p.id} value={p.id}>{p.first_name} {p.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              >
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Due date</label>
              <input
                type="date"
                value={form.due_date}
                onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))}
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              />
            </div>
          </div>
          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="text-sm text-ink/70 hover:text-ink px-2">Cancel</button>
            <button type="submit" className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors">
              {editingId ? "Save changes" : "Save task"}
            </button>
          </div>
        </form>
      )}

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 w-10"></th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Priority</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Task</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Assigned To</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Assigned By</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={7}>Loading…</td></tr>
            ) : visibleTasks.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={7}>No tasks.</td></tr>
            ) : (
              visibleTasks.map((t) => (
                <tr key={t.id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleDone(t)}
                      aria-label={t.status === "done" ? "Mark open" : "Mark done"}
                      className={`w-5 h-5 rounded-sm border flex items-center justify-center transition-colors ${
                        t.status === "done" ? "bg-jade-600 border-jade-600 text-white" : "border-ink/25 hover:border-jade-500"
                      }`}
                    >
                      {t.status === "done" && <Check size={13} />}
                    </button>
                  </td>
                  <td className="px-4 py-3"><PriorityBadge value={t.priority} /></td>
                  <td className="px-4 py-3">
                    <span className={`font-medium ${t.status === "done" ? "line-through text-ink/50" : "text-ink"}`}>{t.title}</span>
                    {t.description && <div className="text-xs text-ink/70 mt-0.5">{t.description}</div>}
                    {t.status === "done" && t.completed_at && (
                      <div className="text-[11px] text-ink/45 font-nums mt-0.5">Completed {formatFullDate(t.completed_at)}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {t.assignee ? `${t.assignee.first_name} ${t.assignee.last_name || ""}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink/50 text-xs">
                    {t.assigner ? `${t.assigner.first_name} ${t.assigner.last_name || ""}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink/70 font-nums">{t.due_date ? formatFullDate(t.due_date) : "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <button onClick={() => startEdit(t)} aria-label="Edit task" className="text-ink/40 hover:text-jade-600 transition-colors">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => remove(t)} aria-label="Delete task" className="text-ink/40 hover:text-rust-500 transition-colors">
                        <Trash2 size={15} />
                      </button>
                    </div>
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
