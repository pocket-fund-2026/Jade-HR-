import { ChevronLeft, ChevronRight, Plus, Search, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import SalaryImportModal from "../../components/SalaryImportModal.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { formatINR } from "../../lib/format.js";

const PAGE_SIZE = 20;

export default function Employees() {
  const { can } = useAuth();
  const canViewSalary = can("salary.view", "salary.edit");
  const canEditSalary = can("salary.edit");
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [location, setLocation] = useState("all");
  const [page, setPage] = useState(1);
  const [showImport, setShowImport] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/api/employees").then(({ data }) => setEmployees(data)).finally(() => setLoading(false));
  };

  useEffect(load, []);
  useEffect(() => setPage(1), [query, location]);

  const locations = useMemo(
    () => [...new Set(employees.map((e) => e.location).filter(Boolean))].sort(),
    [employees],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return employees.filter((e) => {
      if (location !== "all" && e.location !== location) return false;
      if (!q) return true;
      return (
        `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) ||
        e.employee_code.toLowerCase().includes(q)
      );
    });
  }, [employees, query, location]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE),
    [filtered, pageSafe],
  );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Employees</h2>
          <p className="text-xs text-ink/40 font-nums mt-0.5">{employees.length} on the ledger</p>
        </div>
        <div className="flex gap-3">
          {canEditSalary && (
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-4 py-2.5 rounded-sm text-sm font-semibold hover:border-jade-500 transition-colors"
            >
              <Upload size={16} />
              Import Salaries
            </button>
          )}
          <Link
            to="/admin/employees/new"
            className="flex items-center gap-2 bg-ledger-800 text-manila px-4 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
          >
            <Plus size={16} />
            Add Employee
          </Link>
        </div>
      </div>

      {showImport && (
        <SalaryImportModal
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); load(); }}
        />
      )}

      <div className="flex gap-3 mb-4">
        <div className="relative max-w-xs flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or code"
            className="w-full rounded-sm border border-ink/15 bg-paper pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
          />
        </div>
        <select
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
        >
          <option value="all">All locations</option>
          {locations.map((loc) => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Name</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Code</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Location</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Designation</th>
              {canViewSalary && (
                <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Gross (B+H+C)</th>
              )}
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/45">Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/40 text-center" colSpan={7}>Loading ledger…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/40 text-center" colSpan={7}>No employees match.</td></tr>
            ) : (
              pageItems.map((e) => (
                <tr key={e.id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <Link to={`/admin/employees/${e.id}`} className="text-ink hover:text-jade-600 font-medium transition-colors">
                      {e.first_name} {e.last_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-ink/50 font-nums">{e.employee_code}</td>
                  <td className="px-5 py-3.5 text-ink/70">{e.location || "—"}</td>
                  <td className="px-5 py-3.5 text-ink/70">
                    {e.designation || "—"}
                    {e.department && <div className="text-xs text-ink/40 mt-0.5">{e.department}</div>}
                  </td>
                  {canViewSalary && (
                    <td className="px-5 py-3.5 font-nums">{formatINR(Number(e.basic) + Number(e.hra) + Number(e.conveyance))}</td>
                  )}
                  <td className="px-5 py-3.5">
                    <StampBadge status={e.is_active ? "active" : "inactive"}>
                      {e.is_active ? "Working" : "Inactive"}
                    </StampBadge>
                  </td>
                  <td className="px-5 py-3.5">
                    <Link
                      to={`/admin/employees/${e.id}`}
                      className="flex items-center gap-1.5 text-jade-600 hover:text-jade-700 hover:underline text-xs font-medium"
                    >
                      Details <ChevronRight size={12} />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {!loading && filtered.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-xs text-ink/40 font-nums">
            Showing {(pageSafe - 1) * PAGE_SIZE + 1}–{Math.min(pageSafe * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageSafe <= 1}
              className="flex items-center gap-1 px-3 py-1.5 rounded-sm border border-ink/15 bg-paper text-sm text-ink disabled:opacity-40 hover:border-jade-500 transition-colors"
            >
              <ChevronLeft size={14} /> Prev
            </button>
            <span className="text-xs text-ink/50 font-nums px-2">Page {pageSafe} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageSafe >= totalPages}
              className="flex items-center gap-1 px-3 py-1.5 rounded-sm border border-ink/15 bg-paper text-sm text-ink disabled:opacity-40 hover:border-jade-500 transition-colors"
            >
              Next <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
