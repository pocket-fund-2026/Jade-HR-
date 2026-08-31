import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../../lib/api.js";

const today = new Date();

async function exportExcel(rows, scope, periods) {
  const XLSX = await import("xlsx");
  const data = rows.map((r) => ({
    "Emp Code": r.employee_code,
    Name: r.name,
    "On Time %": r.on_time_pct ?? "",
    "Daily Tolerance": r.daily_tolerance_count,
    "Extended Buffer": r.extended_buffer_count,
    "Level 1": r.level1_count,
    "Level 2": r.level2_count,
    "Level 3": r.level3_count,
    "Yellow Card Months": r.yellow_card_months,
    "Red Card Months": r.red_card_months,
    "AIP Instances": r.aip_instances,
    "Avg Reporting Time": r.average_reporting_time || "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Punctuality");
  XLSX.writeFile(wb, `jade-hr-punctuality-${scope}-${periods.join("_")}.xlsx`);
}

export default function PunctualityReport() {
  const [scope, setScope] = useState("month");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [financialYear, setFinancialYear] = useState(`${today.getFullYear()}-${String((today.getFullYear() + 1) % 100).padStart(2, "0")}`);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = () => {
    setLoading(true);
    setError("");
    const params = { scope };
    if (scope === "year") params.financial_year = financialYear;
    else { params.year = year; params.month = month; }
    api.get("/api/late-policy/v3/punctuality", { params })
      .then(({ data }) => setReport(data))
      .catch((err) => setError(err.response?.data?.detail || "Could not load report"))
      .finally(() => setLoading(false));
  };

  useEffect(search, []);

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <h2 className="font-display text-2xl text-ink mt-2 mb-1">Punctuality Calculator</h2>
      <p className="text-xs text-ink/70 font-nums mb-6">Doc §16 — on-time %, tier counts, Yellow/Red Card months and average reporting time, corporate roster only</p>

      <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Scope</label>
            <div className="flex rounded-sm border border-ink/15 overflow-hidden text-xs">
              {["month", "quarter", "year"].map((s) => (
                <button
                  key={s}
                  onClick={() => setScope(s)}
                  className={`flex-1 px-3 py-2 font-semibold capitalize transition-colors ${scope === s ? "bg-ledger-800 text-manila" : "bg-paper text-ink/70 hover:text-ink"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          {scope === "year" ? (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Financial Year</label>
              <input
                value={financialYear} onChange={(e) => setFinancialYear(e.target.value)}
                placeholder="2026-27"
                className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink font-nums focus:outline-none focus:ring-2 focus:ring-jade-500"
              />
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Year</label>
                <input
                  type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
                  className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink font-nums focus:outline-none focus:ring-2 focus:ring-jade-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Month (pay period)</label>
                <input
                  type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))}
                  className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink font-nums focus:outline-none focus:ring-2 focus:ring-jade-500"
                />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end mt-4">
          <button
            onClick={search}
            className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
          >
            Search
          </button>
        </div>
        {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mt-3">{error}</p>}
      </div>

      {loading && <p className="text-ink/70">Loading…</p>}

      {report && !loading && (
        <div className="bg-paper rounded-sm shadow-card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4 pb-3">
            <p className="text-xs text-ink/70">{report.periods.join(", ")}</p>
            <button
              onClick={() => exportExcel(report.employees, scope, report.periods)}
              className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 transition-colors"
            >
              <FileSpreadsheet size={15} /> Excel
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left sticky top-0 z-10 bg-paper">
                <tr className="border-b-2 border-ink/10">
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Employee</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">On Time %</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Daily Tol.</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Ext. Buffer</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Level 1</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Level 2</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Level 3</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Yellow Mo.</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Red Mo.</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">AIP</th>
                  <th className="px-3 py-2.5 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Avg Reporting</th>
                </tr>
              </thead>
              <tbody>
                {report.employees.length === 0 ? (
                  <tr><td className="px-3 py-8 text-ink/70 text-center" colSpan={11}>No corporate employees for this period.</td></tr>
                ) : (
                  report.employees.map((r) => (
                    <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                      <td className="px-3 py-2">
                        <span className="text-ink font-medium">{r.name}</span>
                        <div className="text-xs text-ink/70 font-nums">{r.employee_code}</div>
                      </td>
                      <td className="px-3 py-2 font-nums text-right">{r.on_time_pct ?? "—"}</td>
                      <td className="px-3 py-2 font-nums text-right">{r.daily_tolerance_count}</td>
                      <td className="px-3 py-2 font-nums text-right">{r.extended_buffer_count}</td>
                      <td className="px-3 py-2 font-nums text-right">{r.level1_count}</td>
                      <td className="px-3 py-2 font-nums text-right">{r.level2_count}</td>
                      <td className="px-3 py-2 font-nums text-right">{r.level3_count}</td>
                      <td className="px-3 py-2 font-nums text-right">{r.yellow_card_months}</td>
                      <td className="px-3 py-2 font-nums text-right">{r.red_card_months}</td>
                      <td className="px-3 py-2 font-nums text-right">{r.aip_instances}</td>
                      <td className="px-3 py-2 font-nums text-right">{r.average_reporting_time || "—"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
