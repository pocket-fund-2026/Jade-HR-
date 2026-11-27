import { useEffect, useState } from "react";

import EmptyState from "../../components/EmptyState.jsx";
import PersonAvatar from "../../components/PersonAvatar.jsx";
import { PageHeader, TeamTabs } from "../../components/TeamUI.jsx";
import api from "../../lib/api.js";

const ROLE_LABELS = { employee: "Employee", hr: "HR", accounts: "Accounts" };

const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function TeamLate() {
  const today = isoDay(new Date());
  const [day, setDay] = useState(today);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setData(null);
    api.get("/api/me/team-late", { params: { for_date: day } })
      .then(({ data }) => { setData(data); setError(""); })
      .catch((e) => setError(e.response?.data?.detail || "Could not load late arrivals"));
  }, [day]);

  return (
    <div className="bg-paper rounded-sm shadow-card mb-6 overflow-hidden">
      <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-ink/10">
        <div>
          <h3 className="font-display text-lg text-ink">Late in your team</h3>
          <p className="text-xs text-ink/60">Arrived after their cutoff, on the same basis as their payslip.</p>
        </div>
        <input type="date" aria-label="Show late arrivals for date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)}
          className="rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 min-h-[44px] text-sm text-ink" />
      </div>
      {error ? (
        <p className="px-5 py-4 text-sm text-rust-500">{error}</p>
      ) : !data ? (
        <p className="px-5 py-4 text-sm text-ink/60">Loading late arrivals…</p>
      ) : data.late.length === 0 ? (
        <p className="px-5 py-4 text-sm text-ink/60">Nobody in your team was late on this day.</p>
      ) : (
        <ul className="divide-y divide-ink/[0.07]">
          {data.late.map((r) => (
            <li key={r.employee_code} className="flex items-center gap-4 px-5 py-3 flex-wrap">
              <span className="font-nums text-sm font-semibold text-rust-600 w-[70px]">{r.time}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-ink truncate">{r.name}</span>
                <span className="block text-[11px] text-ink/55">{r.department || r.location || r.employee_code}</span>
              </span>
              {r.late_mark_count != null && <span className="text-[11px] text-ink/55 font-nums">{r.late_mark_count} late this period</span>}
              {r.late_card && <span className="text-[10px] font-bold px-1.5 py-[1px] rounded-sm bg-ochre-400 text-ink">{r.late_card}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function MyTeam() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/api/me/team-members")
      .then(({ data }) => setMembers(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <TeamTabs />
      <PageHeader title="My team" subtitle="The people who report to you." />

      <TeamLate />

      {loading ? (
        <p className="text-sm text-ink/60 py-8 text-center">Loading team…</p>
      ) : members.length === 0 ? (
        <div className="bg-paper rounded-sm shadow-card">
          <EmptyState title="No one reports to you yet" action={{ label: "Read the help guide", to: "/employee/help" }}><abbr className="acr">HR</abbr> sets reporting lines on each employee record. Ask <abbr className="acr">HR</abbr> to add your team if this looks wrong.</EmptyState>
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {members.map((m) => (
            <li key={m.id} className="bg-paper rounded-sm shadow-card p-4 flex items-start gap-3 min-w-0">
              <PersonAvatar person={m} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink truncate">{m.first_name} {m.last_name}</p>
                <p className="text-xs text-ink/60 truncate">{m.designation || "—"}</p>
                <p className="text-[11px] text-ink/50 truncate mt-1">
                  <span className="font-nums">{m.employee_code}</span>
                  {m.role !== "employee" ? ` · ${ROLE_LABELS[m.role] || m.role}` : ""}
                  {m.department ? ` · ${m.department}` : ""}
                </p>
                {m.location && <p className="text-[11px] text-ink/50 truncate">{m.location}</p>}
              </div>
              {!m.is_active && <span className="text-[10px] font-semibold text-ink/50 flex-shrink-0">Inactive</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
