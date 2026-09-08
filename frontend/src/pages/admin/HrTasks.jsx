import { Check, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../../lib/api.js";
import { formatFullDate } from "../../lib/format.js";
import { useAuth } from "../../lib/auth.jsx";

const EMPTY = { title: "", description: "", assigned_to: "", due_date: "" };

// HR-team-only task list — gated by backend/auth.py's require_hr_role (role
// must literally be "hr"; Accounts does not see this section, see
// App.jsx's RequireHrRole and AdminLayout.jsx's hrOnly nav flag).
export default function HrTasks() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [hrPeople, setHrPeople] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("open");
  const [form, setForm] = useState(EMPTY);
  const [showForm, setShowForm] = useState(false);
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
      .then(({ data }) => setHrPeople(data.filter((e) => e.role === "hr")))
      .catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!form.title.trim()) {
      setError("Enter a title");
      return;
    }
    try {
      await api.post("/api/hr-tasks", {
        title: form.title,
        description: form.description,
        assigned_to: form.assigned_to || null,
        due_date: form.due_date || null,
      });
      setForm(EMPTY);
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">HR Tasks</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">Internal to-dos for the HR team — not visible to Accounts.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            <option value="open">Open</option>
            <option value="done">Done</option>
            <option value="all">All</option>
          </select>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="flex items-center gap-2 bg-ledger-800 text-manila px-4 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
          >
            <Plus size={16} /> New Task
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-5 mb-6 space-y-4">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
            <button type="button" onClick={() => setShowForm(false)} className="text-sm text-ink/70 hover:text-ink px-2">Cancel</button>
            <button type="submit" className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors">Save task</button>
          </div>
        </form>
      )}

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 w-10"></th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Task</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Assigned To</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Due</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={5}>Loading…</td></tr>
            ) : tasks.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={5}>No tasks.</td></tr>
            ) : (
              tasks.map((t) => (
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
                  <td className="px-4 py-3">
                    <span className={`font-medium ${t.status === "done" ? "line-through text-ink/50" : "text-ink"}`}>{t.title}</span>
                    {t.description && <div className="text-xs text-ink/70 mt-0.5">{t.description}</div>}
                  </td>
                  <td className="px-4 py-3 text-ink/70">
                    {t.assignee ? `${t.assignee.first_name} ${t.assignee.last_name || ""}` : "—"}
                  </td>
                  <td className="px-4 py-3 text-ink/70 font-nums">{t.due_date ? formatFullDate(t.due_date) : "—"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => remove(t)} aria-label="Delete task" className="text-ink/40 hover:text-rust-500 transition-colors">
                      <Trash2 size={15} />
                    </button>
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
