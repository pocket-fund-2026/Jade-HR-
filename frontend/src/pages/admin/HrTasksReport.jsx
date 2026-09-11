import { AlertTriangle, ArrowLeft, Clock, UserX } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../lib/api.js";
import { formatDate } from "../../lib/format.js";

const PRIORITY_CLASS = {
  urgent: "text-rust-500",
  high: "text-ochre-700",
  normal: "text-ink/60",
  low: "text-ink/40",
};

function Stat({ label, value, sub, tone }) {
  return (
    <div className="bg-paper rounded-sm shadow-card px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">{label}</p>
      <p className={`font-display text-2xl font-nums mt-0.5 ${tone || "text-ink"}`}>{value}</p>
      {sub && <p className="text-[11px] text-ink/60 mt-0.5">{sub}</p>}
    </div>
  );
}

// A list of tasks that need attention — shared by the overdue / stale /
// unassigned sections, which differ only in what makes them notable.
function TaskList({ icon: Icon, title, blurb, tasks, note, empty }) {
  return (
    <div className="bg-paper rounded-sm shadow-card overflow-hidden mb-5">
      <div className="px-5 pt-4 pb-3 border-b border-ink/[0.06]">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 flex items-center gap-1.5">
          <Icon size={13} /> {title} {tasks.length > 0 && <span className="text-ink/40 normal-case font-normal">({tasks.length})</span>}
        </p>
        {blurb && <p className="text-[11px] text-ink/60 mt-1">{blurb}</p>}
      </div>
      {tasks.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink/70 text-center">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} className="border-b border-ink/[0.06] last:border-0">
                <td className="px-5 py-3">
                  <span className="text-ink font-medium">{t.title}</span>
                  <div className={`text-[11px] uppercase tracking-wide font-semibold ${PRIORITY_CLASS[t.priority] || ""}`}>
                    {t.priority}
                  </div>
                </td>
                <td className="px-5 py-3 text-ink/70">{t.assignee || <span className="text-ochre-700">Unassigned</span>}</td>
                <td className="px-5 py-3 font-nums text-ink/70 text-right whitespace-nowrap">{note(t)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function HrTasksReport() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/hr-tasks-report").then(({ data }) => setData(data)).finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-ink/70">Loading…</p>;
  if (!data) return <p className="text-ink/70">Could not load the report.</p>;

  const { totals, turnaround_days: turn, by_priority: prio, by_person } = data;

  return (
    <div>
      <Link to="/admin/hr-tasks" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors mb-4">
        <ArrowLeft size={13} /> Back to HR Tasks
      </Link>
      <h2 className="font-display text-2xl text-ink mb-1">HR Tasks Report</h2>
      <p className="text-sm text-ink/70 mb-6">
        Where the team's workload actually sits — what has slipped, what nobody owns, and how long things take to close.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <Stat label="Open" value={totals.open} />
        <Stat
          label="Overdue" value={totals.overdue}
          tone={totals.overdue > 0 ? "text-rust-500" : "text-ink"}
          sub={totals.overdue > 0 ? "past their due date" : "nothing late"}
        />
        <Stat
          label="Unassigned" value={totals.unassigned}
          tone={totals.unassigned > 0 ? "text-ochre-700" : "text-ink"}
          sub="no owner"
        />
        <Stat label="Completed" value={totals.done} sub={`${totals.completion_rate}% of all tasks`} />
        <Stat
          label="Median turnaround"
          value={turn.median != null ? `${turn.median}d` : "—"}
          sub={turn.closed_sample ? `across ${turn.closed_sample} closed` : "nothing closed yet"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <div className="bg-paper rounded-sm shadow-card p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-3">Open by priority</p>
          <div className="space-y-2">
            {["urgent", "high", "normal", "low"].map((p) => (
              <div key={p} className="flex items-center gap-3">
                <span className={`text-xs font-semibold uppercase tracking-wide w-16 ${PRIORITY_CLASS[p]}`}>{p}</span>
                <div className="flex-1 h-2 bg-ink/[0.06] rounded-sm overflow-hidden">
                  <div
                    className={`h-full ${p === "urgent" ? "bg-rust-500" : p === "high" ? "bg-ochre-500" : "bg-ink/25"}`}
                    style={{ width: totals.open ? `${(prio[p] / totals.open) * 100}%` : "0%" }}
                  />
                </div>
                <span className="font-nums text-sm text-ink w-6 text-right">{prio[p]}</span>
              </div>
            ))}
          </div>
          {totals.no_due_date > 0 && (
            <p className="text-[11px] text-ink/60 mt-4 pt-3 border-t border-ink/[0.06]">
              {totals.no_due_date} open task{totals.no_due_date === 1 ? " has" : "s have"} no due date, so
              {totals.no_due_date === 1 ? " it" : " they"} can never show as overdue.
            </p>
          )}
        </div>

        <div className="bg-paper rounded-sm shadow-card overflow-hidden">
          <p className="px-5 pt-4 pb-3 text-xs font-semibold uppercase tracking-wider text-ink/70">Load by person</p>
          <table className="w-full text-sm">
            <thead className="text-left">
              <tr className="border-b border-ink/10">
                <th className="px-5 py-2 font-semibold text-[10px] uppercase tracking-wider text-ink/70">Person</th>
                <th className="px-5 py-2 font-semibold text-[10px] uppercase tracking-wider text-ink/70 text-right">Open</th>
                <th className="px-5 py-2 font-semibold text-[10px] uppercase tracking-wider text-ink/70 text-right">Overdue</th>
                <th className="px-5 py-2 font-semibold text-[10px] uppercase tracking-wider text-ink/70 text-right">Done</th>
              </tr>
            </thead>
            <tbody>
              {by_person.map((p) => (
                <tr key={p.name} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-2.5">
                    <span className={p.name === "Unassigned" ? "text-ochre-700" : "text-ink"}>{p.name}</span>
                    {p.urgent_open > 0 && (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase text-rust-500">{p.urgent_open} urgent</span>
                    )}
                  </td>
                  <td className="px-5 py-2.5 font-nums text-ink text-right">{p.open}</td>
                  <td className={`px-5 py-2.5 font-nums text-right ${p.overdue > 0 ? "text-rust-500 font-semibold" : "text-ink/50"}`}>{p.overdue}</td>
                  <td className="px-5 py-2.5 font-nums text-ink/60 text-right">{p.done}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <TaskList
        icon={AlertTriangle}
        title="Overdue"
        tasks={data.overdue_tasks}
        note={(t) => `${t.days_overdue}d late`}
        empty="Nothing is past its due date."
      />

      <TaskList
        icon={Clock}
        title="Open 30+ days"
        blurb="Sitting a long time regardless of due date — a different problem from merely late."
        tasks={data.stale_tasks}
        note={(t) => `${t.days_open}d open`}
        empty="Nothing has been open more than 30 days."
      />

      <TaskList
        icon={UserX}
        title="Unassigned"
        blurb="Nobody owns these, so nobody is going to close them."
        tasks={data.unassigned_tasks}
        note={(t) => (t.due_date ? `due ${formatDate(t.due_date)}` : "no due date")}
        empty="Every open task has an owner."
      />
    </div>
  );
}
