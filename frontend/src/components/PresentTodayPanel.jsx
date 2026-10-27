import { Users } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";

function Bar({ percent }) {
  return (
    <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden">
      <div className="h-full bg-jade-600" style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

export default function PresentTodayPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  const [department, setDepartment] = useState("all");

  useEffect(() => {
    api.get("/api/biometric/present-today").then(({ data }) => setData(data)).catch(() => setError(true));
  }, []);

  if (error) return null;
  if (!data) return null;

  const selected = department === "all" ? data : data.departments.find((d) => d.department === department) || data;

  return (
    <div className="bg-paper rounded-sm shadow-card px-5 py-4 mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70 flex items-center gap-1.5">
          <Users size={13} /> Present today
        </p>
        <select
          aria-label="Filter by department"
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
        >
          <option value="all">All departments</option>
          {data.departments.map((d) => (
            <option key={d.department} value={d.department}>{d.department}</option>
          ))}
        </select>
      </div>
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-display text-3xl text-ink font-nums">{selected.percent}%</span>
        <span className="text-sm text-ink/70 font-nums">{selected.present} of {selected.total} present</span>
      </div>
      <Bar percent={selected.percent} />
      <p className="text-[11px] text-ink/60 mt-1">Counted from today's biometric punches (active employees).</p>
      {department === "all" && (
        <ul className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {data.departments.map((d) => (
            <li key={d.department}>
              <div className="flex justify-between text-sm text-ink mb-1">
                <span className="truncate">{d.department}</span>
                <span className="font-nums text-ink/70">{d.percent}% · {d.present}/{d.total}</span>
              </div>
              <Bar percent={d.percent} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
