import { ArrowLeft, FileSpreadsheet, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import MonthPicker from "../../../components/MonthPicker.jsx";
import api from "../../../lib/api.js";
import { formatINR } from "../../../lib/format.js";

const today = new Date();
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const STORAGE_KEY = "jade-hr-gl-account-names";
const DEFAULT_ACCOUNTS = {
  salaryExpense: "Salary Expense A/c",
  employerPf: "Employer PF Contribution A/c",
  employerEsic: "Employer ESIC Contribution A/c",
  employerLwf: "Employer LWF Contribution A/c",
  pfPayable: "PF Payable A/c",
  esicPayable: "ESIC Payable A/c",
  ptPayable: "PT Payable A/c",
  lwfPayable: "LWF Payable A/c",
  salaryPayable: "Salary Payable / Bank A/c",
};

function loadAccountNames() {
  try {
    return { ...DEFAULT_ACCOUNTS, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_ACCOUNTS };
  }
}

async function exportExcel(entries, year, month) {
  const XLSX = await import("xlsx");
  const data = entries.map((e) => ({
    "Account": e.account,
    "Debit": e.debit || "",
    "Credit": e.credit || "",
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Journal Voucher");
  XLSX.writeFile(wb, `jade-hr-accounts-jv-${MONTH_NAMES[month - 1]}-${year}.xlsx`);
}

export default function AccountsJvReport() {
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState(loadAccountNames);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.get("/api/payroll", { params: { year, month } })
      .then(({ data }) => setRows(data))
      .finally(() => setLoading(false));
  }, [year, month]);

  const saveAccounts = (next) => {
    setAccounts(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const totals = rows.reduce((acc, r) => {
    const gross = r.basic + r.hra + r.conveyance + r.other_allowance + r.monthly_bonus + r.retention + r.incentive + r.ot_amount;
    const employerPf = r.pf_employer_eps + r.pf_employer_epf + r.pf_edli_charges + r.pf_admin_charges;
    return {
      salaryExpense: acc.salaryExpense + gross,
      employerPf: acc.employerPf + employerPf,
      employerEsic: acc.employerEsic + r.esic_employer,
      employerLwf: acc.employerLwf + r.lwf_employer,
      pfPayable: acc.pfPayable + r.ded_pf + employerPf,
      esicPayable: acc.esicPayable + r.ded_esic + r.esic_employer,
      ptPayable: acc.ptPayable + r.ded_pt,
      lwfPayable: acc.lwfPayable + r.ded_lwf + r.lwf_employer,
      salaryPayable: acc.salaryPayable + r.total_payable,
    };
  }, {
    salaryExpense: 0, employerPf: 0, employerEsic: 0, employerLwf: 0,
    pfPayable: 0, esicPayable: 0, ptPayable: 0, lwfPayable: 0, salaryPayable: 0,
  });

  const debitEntries = [
    { key: "salaryExpense", value: totals.salaryExpense },
    { key: "employerPf", value: totals.employerPf },
    { key: "employerEsic", value: totals.employerEsic },
    { key: "employerLwf", value: totals.employerLwf },
  ].filter((e) => e.value > 0);
  const creditEntries = [
    { key: "pfPayable", value: totals.pfPayable },
    { key: "esicPayable", value: totals.esicPayable },
    { key: "ptPayable", value: totals.ptPayable },
    { key: "lwfPayable", value: totals.lwfPayable },
    { key: "salaryPayable", value: totals.salaryPayable },
  ].filter((e) => e.value > 0);

  const totalDebit = debitEntries.reduce((s, e) => s + e.value, 0);
  const totalCredit = creditEntries.reduce((s, e) => s + e.value, 0);
  const entries = [
    ...debitEntries.map((e) => ({ account: accounts[e.key], debit: e.value, credit: 0 })),
    ...creditEntries.map((e) => ({ account: accounts[e.key], debit: 0, credit: e.value })),
  ];

  return (
    <div>
      <Link to="/admin/reports" className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors">
        <ArrowLeft size={13} /> Back to Reports
      </Link>
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mt-2 mb-6">
        <div>
          <h2 className="font-display text-2xl text-ink">Accounts JV — Payroll Journal Voucher</h2>
          <p className="text-xs text-ink/70 mt-1">Account names are generic defaults — edit them to match your chart of accounts. Saved to this browser only.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => setEditing((v) => !v)}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 transition-colors"
          >
            <Pencil size={14} /> {editing ? "Done Editing" : "Edit Account Names"}
          </button>
          <button
            onClick={() => exportExcel(entries, year, month)}
            disabled={!entries.length}
            className="flex items-center gap-2 bg-paper border border-ink/15 text-ink px-3 py-2 rounded-sm text-sm font-semibold hover:border-jade-500 disabled:opacity-40 transition-colors"
          >
            <FileSpreadsheet size={15} /> Export Excel
          </button>
          <MonthPicker year={year} month={month} onChange={(y, m) => { setYear(y); setMonth(m); }} />
        </div>
      </div>

      {editing && (
        <div className="bg-paper rounded-sm shadow-card p-5 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Object.keys(DEFAULT_ACCOUNTS).map((key) => (
            <div key={key}>
              <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">{DEFAULT_ACCOUNTS[key]}</label>
              <input
                type="text"
                value={accounts[key]}
                onChange={(e) => saveAccounts({ ...accounts, [key]: e.target.value })}
                className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              />
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-ink/70">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink/70">No payroll data for this month.</p>
      ) : (
        <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left sticky top-0 z-10 bg-paper">
              <tr className="border-b-2 border-ink/10">
                <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Account</th>
                <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Debit</th>
                <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70 text-right">Credit</th>
              </tr>
            </thead>
            <tbody>
              {debitEntries.map((e) => (
                <tr key={e.key} className="border-b border-ink/[0.06]">
                  <td className="px-5 py-2.5 text-ink/80">Dr &nbsp;{accounts[e.key]}</td>
                  <td className="px-5 py-2.5 text-right font-nums text-ink">{formatINR(e.value)}</td>
                  <td className="px-5 py-2.5"></td>
                </tr>
              ))}
              {creditEntries.map((e) => (
                <tr key={e.key} className="border-b border-ink/[0.06]">
                  <td className="px-5 py-2.5 text-ink/80 pl-10">Cr &nbsp;{accounts[e.key]}</td>
                  <td className="px-5 py-2.5"></td>
                  <td className="px-5 py-2.5 text-right font-nums text-ink">{formatINR(e.value)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-ink/10 font-semibold">
                <td className="px-5 py-3">Total</td>
                <td className="px-5 py-3 text-right font-nums">{formatINR(totalDebit)}</td>
                <td className="px-5 py-3 text-right font-nums">{formatINR(totalCredit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
