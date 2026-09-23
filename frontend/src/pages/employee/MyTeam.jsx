import { useEffect, useState } from "react";

import api from "../../lib/api.js";

const ROLE_LABELS = { employee: "Employee", hr: "HR", accounts: "Accounts" };

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

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
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
                    <span className="text-ink font-medium">{m.first_name} {m.last_name}</span>
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
