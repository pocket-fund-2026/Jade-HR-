import { ChevronDown, Users } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../lib/api.js";

function Bar({ percent }) {
  return (
    <div className="h-1.5 rounded-full bg-ink/10 overflow-hidden">
      <div className="h-full bg-jade-600" style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

function DepartmentRow({ d }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-ink/[0.07] first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-left py-2.5 hover:bg-ink/[0.03] transition-colors"
      >
        <div className="flex justify-between items-center gap-3 text-sm text-ink mb-1">
          <span className="flex items-center gap-1.5 min-w-0">
            <ChevronDown size={14} className={`flex-shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
            <span className="truncate">{d.department}</span>
          </span>
          <span className="font-nums text-ink/70 whitespace-nowrap">{d.percent}% · {d.present}/{d.total}</span>
        </div>
        <Bar percent={d.percent} />
      </button>
      {open && (
        <ul className="pb-3 pl-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
          {d.employees.map((e) => (
            <li key={e.employee_code} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate text-ink">{e.name} <span className="text-ink/50 font-nums">{e.employee_code}</span></span>
              <span className={`text-xs font-semibold ${e.present ? "text-jade-700" : "text-rust-600"}`}>
                {e.present ? "Present" : "Not in"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export default function PresentTodayPanel() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    api.get("/api/biometric/present-today").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data) return null;

  return (
    <div className="bg-paper rounded-sm shadow-card px-5 py-4 mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full text-left"
      >
        <div className="flex items-center justify-between gap-3 mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70 flex items-center gap-1.5">
            <Users size={13} /> Present today
          </p>
          <span className="flex items-center gap-1 text-xs font-semibold text-jade-700">
            {open ? "Hide departments" : "Show departments"}
            <ChevronDown size={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-display text-3xl text-ink font-nums">{data.percent}%</span>
          <span className="text-sm text-ink/70 font-nums">{data.present} of {data.total} present</span>
        </div>
        <Bar percent={data.percent} />
        <p className="text-[11px] text-ink/60 mt-1">Counted from today's biometric punches (active employees).</p>
      </button>
      {open && (
        <ul className="mt-3">
          {data.departments.map((d) => <DepartmentRow key={d.department} d={d} />)}
        </ul>
      )}
    </div>
  );
}
