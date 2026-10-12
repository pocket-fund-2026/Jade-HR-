import { useEffect, useState } from "react";

import PersonAvatar from "../../components/PersonAvatar.jsx";
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
        <input type="date" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)}
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
            <li key={r.employee_code} className="flex items-center gap-3 px-5 py-3 flex-wrap">
              <span className="font-nums text-sm font-semibold text-rust-600 w-[70px]">{r.time}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm text-ink truncate">{r.name}</span>
                <span className="block text-[11px] text-ink/55">{r.department || r.location || r.employee_code}</span>
              </span>
              {r.late_mark_count != null && <span className="text-[11px] text-ink/55 font-nums">{r.late_mark_count} late this period</span>}
              {r.late_card && <span className="text-[10px] font-bold uppercase px-1.5 py-[1px] rounded-sm bg-ochre-400 text-ink">{r.late_card}</span>}
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
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ink">My Team</h2>
        <p className="text-xs text-ink/70 font-nums mt-0.5">Just the people who report to you — not the wider company directory</p>
      </div>

      <TeamLate />

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Name</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Designation</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Department</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Location</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={5}>Loading team…</td></tr>
            ) : members.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={5}>Nobody is currently listed as reporting to you.</td></tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="border-b border-ink/[0.06] last:border-0">
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-2.5 text-ink font-medium"><PersonAvatar person={m} />{m.first_name} {m.last_name}</span>
                    <div className="text-xs text-ink/70 font-nums">{m.employee_code}{m.role !== "employee" ? ` · ${ROLE_LABELS[m.role] || m.role}` : ""}</div>
                  </td>
                  <td className="px-5 py-3.5 text-ink/70">{m.designation || "—"}</td>
                  <td className="px-5 py-3.5 text-ink/70">{m.department || "—"}</td>
                  <td className="px-5 py-3.5 text-ink/70">{m.location || "—"}</td>
                  <td className="px-5 py-3.5">
                    <span className={`text-xs font-semibold uppercase tracking-wide ${m.is_active ? "text-jade-700" : "text-ink/50"}`}>
                      {m.is_active ? "Active" : "Inactive"}
                    </span>
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
