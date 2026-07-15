import { ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../../lib/api.js";

function countBy(rows, key) {
  const counts = {};
  for (const r of rows) {
    const value = r[key] || "—";
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function BreakdownTable({ title, rows, total }) {
  return (
    <div className="bg-paper rounded-sm shadow-card overflow-hidden">
      <p className="px-4 pt-3 pb-2 text-xs font-semibold uppercase tracking-wider text-ink/70">{title}</p>
      <table className="w-full text-sm">
        <tbody>
          {rows.map(([label, count]) => (
            <tr key={label} className="border-t border-ink/[0.06]">
              <td className="px-4 py-2.5 text-ink/80">{label}</td>
              <td className="px-4 py-2.5 font-nums text-right text-ink font-medium">{count}</td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink/10 font-semibold">
            <td className="px-4 py-2.5">Total</td>
            <td className="px-4 py-2.5 font-nums text-right">{total}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function HeadCountReport() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/employees").then(({ data }) => setEmployees(data)).finally(() => setLoading(false));
  }, []);

  const active = useMemo(() => employees.filter((e) => e.is_active), [employees]);
  const byLocation = useMemo(() => countBy(active, "location"), [active]);
  const byDepartment = useMemo(() => countBy(active, "department"), [active]);
  const byCategory = useMemo(() => countBy(active, "employee_category"), [active]);

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <h2 className="font-display text-2xl text-ink mt-2 mb-6">Head Count</h2>

      {loading ? (
        <p className="text-ink/70">Loading…</p>
      ) : (
        <>
          <div className="bg-paper rounded-sm shadow-card px-5 py-4 border-t-2 border-jade-500 mb-6 max-w-xs">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">Active Employees</p>
            <p className="font-display text-2xl text-jade-700 mt-1">{active.length}</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <BreakdownTable title="By Location" rows={byLocation} total={active.length} />
            <BreakdownTable title="By Department" rows={byDepartment} total={active.length} />
            <BreakdownTable title="By Category" rows={byCategory} total={active.length} />
          </div>
        </>
      )}
    </div>
  );
}
