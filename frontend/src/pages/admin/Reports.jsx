import {
  Award, Banknote, BookOpen, CalendarClock, Clock, Coins, FileSpreadsheet, Gift, Landmark, Receipt, ScrollText, ShieldCheck,
  TrendingUp, Users, Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";

const CATEGORIES = [
  {
    title: "Salary",
    items: [
      { to: "/admin/reports/salary-sheet", label: "Salary Sheet", desc: "Full monthly earnings/deductions breakdown, all employees", icon: FileSpreadsheet },
      { to: "/admin/reports/yearly-salary", label: "Yearly / Cumulative Salary Details", desc: "Salary Sheet summed across a From–To range of pay periods", icon: TrendingUp },
      { to: "/admin/reports/arrears", label: "Arrear Details", desc: "Every Salary Structure revision carrying a one-off arrear payment", icon: ScrollText },
      { to: "/admin/reports/lumpsum", label: "Lumpsum Report", desc: "Arrear/Bonus/Leave Encash/PLP/Loan Interest/OtherDed/Advance/PF Arrear, editable per pay period", icon: Coins },
      { to: "/admin/reports/full-and-final", label: "Payslip Full & Final", desc: "Exit settlement: last payslip + leave encashment + gratuity", icon: BookOpen },
    ],
  },
  {
    title: "MIS",
    items: [
      { to: "/admin/reports/bank-transfer", label: "Bank Transfer — Salary", desc: "Net salary by bank account, for the monthly payment file", icon: Landmark },
      { to: "/admin/reports/head-count", label: "Head Count", desc: "Active employees by location, department, category", icon: Users },
      { to: "/admin/reports/ctc-as-per-salary", label: "CTC As Per Salary", desc: "Each employee's latest Salary Structure CTC snapshot", icon: Wallet },
      { to: "/admin/reports/ctc-as-per-payslip", label: "CTC As Per Payslip", desc: "Actual cost for a selected period, from real payslip figures", icon: Wallet },
      { to: "/admin/reports/accounts-jv", label: "Accounts JV", desc: "Payroll journal voucher — debit/credit by (editable) GL account", icon: Banknote },
    ],
  },
  {
    title: "PF",
    items: [
      { to: "/admin/reports/pf", label: "PF Sheet & Challan", desc: "Per-employee PF wages/contributions plus the monthly deposit total", icon: ShieldCheck },
    ],
  },
  {
    title: "ESIC",
    items: [
      { to: "/admin/reports/esic", label: "ESIC Sheet & Challan", desc: "Per-employee ESIC wages/contributions plus the monthly deposit total", icon: Wallet },
    ],
  },
  {
    title: "PT",
    items: [
      { to: "/admin/reports/pt", label: "PT Sheet & Challan", desc: "Per-employee Professional Tax plus the monthly deposit total", icon: Banknote },
    ],
  },
  {
    title: "LWF",
    items: [
      { to: "/admin/reports/lwf", label: "LWF Sheet & Challan", desc: "Per-employee Labour Welfare Fund plus the half-yearly deposit total", icon: ShieldCheck },
    ],
  },
  {
    title: "Income Tax",
    items: [
      { to: "/admin/reports/tds-projection", label: "TDS Projection", desc: "Projected annual tax and monthly TDS per employee, by declared regime", icon: Receipt },
    ],
  },
  {
    title: "Bonus",
    items: [
      { to: "/admin/reports/bonus", label: "Bonus Calculation", desc: "Payment of Bonus Act, 1965 — eligibility and amount per employee for a financial year", icon: Gift },
    ],
  },
  {
    title: "Gratuity",
    items: [
      { to: "/admin/reports/gratuity", label: "Gratuity Calculation", desc: "Payment of Gratuity Act, 1972 — eligibility and accrued/payable amount per employee", icon: Award },
    ],
  },
  {
    title: "Leave",
    items: [
      { to: "/admin/reports/leave-ledger", label: "Leave Ledger", desc: "Per-employee detailed leave transaction history — credits, debits, opening/closing balance", icon: CalendarClock },
    ],
  },
  {
    title: "Attendance",
    items: [
      { to: "/admin/reports/attendance", label: "Attendance Sheet", desc: "Daily attendance for every employee over a pay period, exportable to Excel", icon: Clock },
    ],
  },
];

export default function Reports() {
  return (
    <div>
      <h2 className="font-display text-2xl text-ink mb-1">Reports</h2>
      <p className="text-sm text-ink/70 mb-6">Statutory and salary reports, computed from the same figures as the payslip.</p>

      <div className="space-y-8">
        {CATEGORIES.map((cat) => (
          <div key={cat.title}>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-3">{cat.title}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cat.items.map(({ to, label, desc, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="bg-paper rounded-sm shadow-card p-5 border-t-2 border-ink/10 hover:border-jade-500 transition-colors"
                >
                  <Icon size={20} className="text-jade-600 mb-3" />
                  <p className="font-display text-ink text-base">{label}</p>
                  <p className="text-xs text-ink/70 mt-1.5 leading-snug">{desc}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
