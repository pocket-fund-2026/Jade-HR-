import {
  Award, Banknote, BookOpen, CalendarClock, CheckSquare, Clock, Coins, FileSpreadsheet, Gift, Landmark, Receipt, ScrollText, ShieldAlert, ShieldCheck,
  TrendingUp, Users, Wallet,
} from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../../lib/auth.jsx";

const CATEGORIES = [
  {
    title: "Salary",
    items: [
      { to: "/admin/reports/salary-sheet", label: "Salary Sheet", desc: "Full monthly earnings/deductions breakdown, all employees", icon: FileSpreadsheet, permission: "payroll.view" },
      { to: "/admin/reports/yearly-salary", label: "Yearly / Cumulative Salary Details", desc: "Salary Sheet summed across a From–To range of pay periods", icon: TrendingUp, permission: "payroll.view" },
      { to: "/admin/reports/arrears", label: "Arrear Details", desc: "Every one-off arrear payment on file, quick-entry or via Salary Structure", icon: ScrollText, permission: "payroll.view" },
      { to: "/admin/reports/salary-paid", label: "Salary Paid Report", desc: "Monthly checklist — mark each employee paid, add an arrear if a past month was missed", icon: CheckSquare, permission: "payroll.view" },
      { to: "/admin/reports/lumpsum", label: "Lumpsum Report", desc: "Arrear/Bonus/Leave Encash/PLP/Loan Interest/OtherDed/Advance/PF Arrear, editable per pay period", icon: Coins, permission: "payroll.view" },
      { to: "/admin/reports/full-and-final", label: "Payslip Full & Final", desc: "Exit settlement: last payslip + leave encashment + gratuity", icon: BookOpen, permission: "payroll.view" },
    ],
  },
  {
    title: "MIS",
    items: [
      { to: "/admin/reports/bank-transfer", label: "Bank Transfer — Salary", desc: "Net salary by bank account, for the monthly payment file", icon: Landmark, permission: "payroll.view" },
      { to: "/admin/reports/head-count", label: "Head Count", desc: "Active employees by location, department, category", icon: Users, permission: ["payroll.view", "employees.view"] },
      { to: "/admin/reports/ctc-as-per-salary", label: "CTC As Per Salary", desc: "Each employee's latest Salary Structure CTC snapshot", icon: Wallet, permission: "payroll.view" },
      { to: "/admin/reports/ctc-as-per-payslip", label: "CTC As Per Payslip", desc: "Actual cost for a selected period, from real payslip figures", icon: Wallet, permission: "payroll.view" },
      { to: "/admin/reports/accounts-jv", label: "Accounts JV", desc: "Payroll journal voucher — debit/credit by (editable) GL account", icon: Banknote, permission: "payroll.view" },
    ],
  },
  {
    title: "PF",
    items: [
      { to: "/admin/reports/pf", label: "PF Sheet & Challan", desc: "Per-employee PF wages/contributions plus the monthly deposit total", icon: ShieldCheck, permission: "payroll.view" },
    ],
  },
  {
    title: "ESIC",
    items: [
      { to: "/admin/reports/esic", label: "ESIC Sheet & Challan", desc: "Per-employee ESIC wages/contributions plus the monthly deposit total", icon: Wallet, permission: "payroll.view" },
    ],
  },
  {
    title: "PT",
    items: [
      { to: "/admin/reports/pt", label: "PT Sheet & Challan", desc: "Per-employee Professional Tax plus the monthly deposit total", icon: Banknote, permission: "payroll.view" },
    ],
  },
  {
    title: "LWF",
    items: [
      { to: "/admin/reports/lwf", label: "LWF Sheet & Challan", desc: "Per-employee Labour Welfare Fund plus the half-yearly deposit total", icon: ShieldCheck, permission: "payroll.view" },
    ],
  },
  {
    title: "Income Tax",
    items: [
      { to: "/admin/reports/tds-projection", label: "TDS Projection", desc: "Projected annual tax and monthly TDS per employee, by declared regime", icon: Receipt, permission: "payroll.view" },
    ],
  },
  {
    title: "Bonus",
    items: [
      { to: "/admin/reports/bonus", label: "Bonus Calculation", desc: "Payment of Bonus Act, 1965 — eligibility and amount per employee for a financial year", icon: Gift, permission: "payroll.view" },
    ],
  },
  {
    title: "Gratuity",
    items: [
      { to: "/admin/reports/gratuity", label: "Gratuity Calculation", desc: "Payment of Gratuity Act, 1972 — eligibility and accrued/payable amount per employee", icon: Award, permission: "payroll.view" },
    ],
  },
  {
    title: "Leave",
    items: [
      { to: "/admin/reports/leave-ledger", label: "Leave Ledger", desc: "Per-employee detailed leave transaction history — credits, debits, opening/closing balance", icon: CalendarClock, permission: ["leave.manage", "payroll.view"] },
    ],
  },
  {
    title: "Attendance",
    items: [
      { to: "/admin/reports/attendance", label: "Attendance Sheet", desc: "Daily attendance for every employee over a pay period, exportable to Excel", icon: Clock, permission: "attendance.restricted_reports" },
      { to: "/admin/reports/punctuality", label: "Punctuality Calculator", desc: "On-time %, tier counts, Yellow/Red Card months, average reporting time", icon: TrendingUp, permission: "attendance.restricted_reports" },
      { to: "/admin/reports/late-night-safety", label: "Late-Working Safety", desc: "Women employees whose last punch was after a cutoff hour, for arranging transport", icon: ShieldAlert, permission: "attendance.restricted_reports" },
    ],
  },
];

export default function Reports() {
  const { can } = useAuth();
  const visibleCategories = CATEGORIES
    .map((cat) => ({ ...cat, items: cat.items.filter(({ permission }) => !permission || can(...[].concat(permission))) }))
    .filter((cat) => cat.items.length > 0);

  return (
    <div>
      <h2 className="font-display text-2xl text-ink mb-1">Reports</h2>
      <p className="text-sm text-ink/70 mb-6">Statutory and salary reports, computed from the same figures as the payslip.</p>

      <div className="space-y-8">
        {visibleCategories.map((cat) => (
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
