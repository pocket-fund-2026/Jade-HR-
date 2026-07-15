import { ArrowLeft, FileSpreadsheet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../../components/MonthPicker.jsx";
import api from "../../../lib/api.js";
import { formatFullDate, formatINR } from "../../../lib/format.js";

const today = new Date();
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const COMPANY_NAME = "Jade Lifestyles India";

// "Other Allow" folds in Monthly Bonus + Retention — the payroll register
// this report mirrors has no separate columns for them, so they'd otherwise
// vanish from TotalErn/Net Salary instead of just being 0 for everyone today.
function otherAllow(r) {
  return r.other_allowance + r.monthly_bonus + r.retention;
}
function otherAllowRate(r) {
  return r.other_allowance_rate + r.monthly_bonus_rate + r.retention_rate;
}
// LWF has no column in this register on purpose — it's deducted half-yearly,
// not every pay cycle (see backend/routers/salary_structure.py), so it's
// handled outside the monthly Salary Sheet rather than folded in here.
function totalErn(r) {
  return r.basic + r.hra + r.conveyance + otherAllow(r) + (r.arrear || 0) + r.ot_amount + r.incentive;
}
function totalDed(r) {
  return r.ded_pf + r.ded_pt + r.ded_esic + r.ded_tds + (r.ded_loan || 0) + (r.ded_loan_int || 0) + (r.ded_other_ded || 0);
}
function netSalary(r) {
  return totalErn(r) - totalDed(r);
}
function leaveWithoutPay(r) {
  return Math.max(0, r.without_pay_days - r.absent_days);
}

// Single source of truth for both the on-screen table and the Excel export —
// matches Accounts' own Salary Sheet register column-for-column.
const COLUMNS = [
  { label: "SrNo", get: (r, i) => i + 1 },
  { label: "EmpCode", get: (r) => r.employee_code },
  { label: "EmpName", get: (r) => r.name },
  { label: "SalaryType", get: () => "Monthly Salary" },
  { label: "Gender", get: (r) => r.gender },
  { label: "Location", get: (r) => r.location },
  { label: "Department", get: (r) => r.department },
  { label: "Designation", get: (r) => r.designation },
  { label: "DOB", get: (r) => r.date_of_birth, date: true },
  { label: "DOJ", get: (r) => r.date_of_joining, date: true },
  { label: "Grade", get: (r) => r.grade },
  { label: "Cost Center", get: (r) => r.cost_center },
  { label: "Basic(Arr)", get: () => 0, money: true },
  { label: "Present", get: (r) => r.present_days, num: true },
  { label: "WeeklyOff", get: (r) => r.weekoff_days, num: true },
  { label: "Absent", get: (r) => r.absent_days, num: true },
  { label: "OTHrs", get: (r) => r.total_ot_hours, num: true },
  { label: "PaidDays", get: (r) => r.paid_days, num: true },
  { label: "PL", get: (r) => r.pl_days, num: true },
  { label: "LeaveWithoutPay1", get: leaveWithoutPay, num: true },
  { label: "Payable Days", get: (r) => r.paid_days, num: true },
  { label: "Basic", get: (r) => r.basic, money: true },
  { label: "Basic(Rate)", get: (r) => r.basic_rate, money: true },
  { label: "HRA", get: (r) => r.hra, money: true },
  { label: "HRA(Rate)", get: (r) => r.hra_rate, money: true },
  { label: "Conv", get: (r) => r.conveyance, money: true },
  { label: "Conv(Rate)", get: (r) => r.conveyance_rate, money: true },
  { label: "Other Allow", get: otherAllow, money: true },
  { label: "Other Allow(Rate)", get: otherAllowRate, money: true },
  { label: "Arrear", get: (r) => r.arrear || 0, money: true },
  { label: "OTAmt", get: (r) => r.ot_amount, money: true },
  { label: "CTC", get: (r) => r.ctc, money: true },
  { label: "Incentive", get: (r) => r.incentive, money: true },
  { label: "Incentive(Rate)", get: (r) => r.incentive_rate, money: true },
  { label: "TotalErn", get: totalErn, money: true, strong: true },
  { label: "PF", get: (r) => r.ded_pf, money: true },
  { label: "PT", get: (r) => r.ded_pt, money: true },
  { label: "ESIC", get: (r) => r.ded_esic, money: true },
  { label: "TDS", get: (r) => r.ded_tds, money: true },
  { label: "Loan", get: (r) => r.ded_loan || 0, money: true },
  { label: "Loan_Int", get: (r) => r.ded_loan_int || 0, money: true },
  { label: "OtherDed", get: (r) => r.ded_other_ded || 0, money: true },
  { label: "TotalDed", get: totalDed, money: true, strong: true },
  { label: "Net Salary", get: netSalary, money: true, strong: true },
  { label: "Bank Name", get: (r) => r.bank_name },
  { label: "IFSC Code", get: (r) => r.bank_ifsc },
  { label: "Bank A/C No.", get: (r) => r.bank_account_no },
  { label: "Beneficiary", get: (r) => r.name },
  { label: "Remarks", get: () => "" },
];

// Columns the reference register totals on its summary row — everything
// else (names, codes, attendance counts, bank details) is left blank there.
const TOTAL_COLUMNS = new Set(["Arrear", "TotalErn", "PF", "PT", "ESIC", "TDS", "Loan", "Loan_Int", "OtherDed", "TotalDed", "Net Salary"]);

function cellValue(col, r, i) {
  const v = col.get(r, i);
  if (col.date) return v ? formatFullDate(v) : "";
  return v ?? "";
}

async function exportExcel(rows, year, month) {
  const XLSX = await import("xlsx");
  const title = `Salary Sheet for ${MONTH_NAMES[month - 1]} ${year}`;
  const headerRow = COLUMNS.map((c) => c.label);
  const totalsRow = COLUMNS.map((col) => {
    if (!TOTAL_COLUMNS.has(col.label)) return null;
    return round2(rows.reduce((sum, r, i) => sum + (Number(col.get(r, i)) || 0), 0));
  });
  const dataRows = rows.map((r, i) => COLUMNS.map((col) => {
    const v = col.get(r, i);
    if (col.date) return v ? v.slice(0, 10) : "";
    return v ?? "";
  }));

  const aoa = [[COMPANY_NAME], [title], headerRow, ...dataRows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // Totals sit on the same row as the title (row 2), aligned under their columns.
  totalsRow.forEach((v, colIdx) => {
    if (v === null) return;
    ws[XLSX.utils.encode_cell({ r: 1, c: colIdx })] = { t: "n", v };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  XLSX.writeFile(wb, `jade-hr-salary-sheet-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export default function SalarySheetReport() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [location, setLocation] = useState("all");

  useEffect(() => {
    setLoading(true);
    api.get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [year, month]);

  const locations = useMemo(() => [...new Set(rows.map((r) => r.location).filter(Boolean))].sort(), [rows]);
  const filtered = useMemo(
    () => (location === "all" ? rows : rows.filter((r) => r.location === location)),
    [rows, location],
  );
  const totals = useMemo(
    () => filtered.reduce((acc, r) => ({
      gross: acc.gross + totalErn(r),
      deductions: acc.deductions + totalDed(r),
      net: acc.net + netSalary(r),
    }), { gross: 0, deductions: 0, net: 0 }),
    [filtered],
  );

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <h2 className="font-display text-2xl text-ink">Salary Sheet</h2>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filter by location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
          >
            <option value="all">All locations</option>
            {locations.map((loc) => <option key={loc} value={loc}>{loc}</option>)}
          </select>
          <button
            onClick={() => exportExcel(filtered, year, month)}
            disabled={!filtered.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-paper rounded-sm shadow-card px-5 py-4 border-t-2 border-ink/10">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">Total Earnings</p>
          <p className="font-display text-xl text-ink mt-1">{formatINR(totals.gross)}</p>
        </div>
        <div className="bg-paper rounded-sm shadow-card px-5 py-4 border-t-2 border-ink/10">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">Total Deductions</p>
          <p className="font-display text-xl text-ink mt-1">{formatINR(totals.deductions)}</p>
        </div>
        <div className="bg-paper rounded-sm shadow-card px-5 py-4 border-t-2 border-jade-500">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">Net Salary</p>
          <p className="font-display text-xl text-jade-700 mt-1">{formatINR(totals.net)}</p>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              {COLUMNS.map((col) => (
                <th key={col.label} className="px-3 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={COLUMNS.length}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td className="px-4 py-8 text-ink/70 text-center" colSpan={COLUMNS.length}>No employees match.</td></tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={r.employee_id} className="border-b border-ink/[0.06] last:border-0 hover:bg-manila/50 transition-colors">
                  {COLUMNS.map((col) => (
                    <td
                      key={col.label}
                      className={`px-3 py-2.5 whitespace-nowrap ${col.money || col.num ? "font-nums" : ""} ${col.strong ? "font-semibold" : ""} ${col.label === "Net Salary" ? "text-jade-700" : ""}`}
                    >
                      {col.money ? formatINR(cellValue(col, r, i)) : cellValue(col, r, i)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
