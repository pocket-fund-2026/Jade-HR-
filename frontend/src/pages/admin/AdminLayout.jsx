import { Briefcase, BookOpen, CalendarCheck, CalendarClock, CalendarDays, CalendarPlus, CheckSquare, ClipboardList, DoorOpen, FileBarChart, FileText, Flag, Home, KeyRound, LayoutDashboard, LogOut, MapPin, Menu, Plane, Receipt, Search, Shield, ShieldAlert, ShieldCheck, Stamp, UserPlus, Users, Users2, Wallet, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import ChangePasswordModal from "../../components/ChangePasswordModal.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { canSeeHrTasks } from "../../lib/hrTasksAccess.js";
import { REPORT_CATEGORIES } from "../../lib/reportsCatalog.js";

const POLL_MS = 25000;

const navItems = [
  // Overview
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },

  // People — headcount, hiring, absence
  { to: "/admin/employees", label: "Employees", icon: Users, permission: "employees.view" },
  { to: "/admin/onboarding", label: "Onboarding", icon: UserPlus, badgeKey: "onboarding", permission: "onboarding.manage" },
  { to: "/admin/careers", label: "Careers", icon: Users2, permission: "careers.manage" },
  { to: "/admin/work-absence", label: "Work Absence", icon: Briefcase, badgeKey: "workAbsence", permission: "absence.manage" },
  { to: "/admin/confirmations", label: "Confirmations", icon: CalendarCheck, permission: "employees.manage" },
  { to: "/admin/exit", label: "Exit Procedure", icon: DoorOpen, permission: "exit.manage" },

  // Time & Leave — requests, tracking, policy
  { to: "/admin/leave", label: "Leave", icon: Plane, badgeKey: "leave", permission: "leave.manage", sectionBreak: true },
  { to: "/admin/leave-entry", label: "Leave Entry", icon: ClipboardList, permission: "leave.manage" },
  { to: "/admin/wfh-requests", label: "WFH Requests", icon: Home, badgeKey: "wfh", permission: ["leave.manage", "wfh.approve"] },
  { to: "/admin/market-visits", label: "Market Visits", icon: MapPin, badgeKey: "marketVisits", permission: "market_visits.review" },
  { to: "/admin/comp-off", label: "Comp-Off", icon: CalendarClock, permission: ["employees.manage", "policy.manage"] },
  { to: "/admin/aip", label: "AIP", icon: ShieldAlert, permission: "leave.manage" },
  { to: "/admin/policy", label: "Leave Policy", icon: CalendarDays, permission: ["employees.manage", "policy.manage"] },

  // Payroll & Finance
  { to: "/admin/payroll", label: "Payroll & OT", icon: Receipt, permission: "payroll.view", sectionBreak: true },
  { to: "/admin/payslip-approvals", label: "Payslip Approvals", icon: Stamp, badgeKey: "payslipApprovals", permission: "payslip_approvals.manage" },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart, permission: ["payroll.view", "attendance.restricted_reports"] },
  { to: "/admin/loans", label: "Loan Requests", icon: Wallet, badgeKey: "loans", permission: "loans.manage" },

  // Documents & Compliance
  { to: "/admin/letters", label: "Letters", icon: FileText, permission: ["letters.generate", "letters.manage"], sectionBreak: true },
  { to: "/admin/disputes", label: "Disputes", icon: Flag, badgeKey: "disputes", permission: "disputes.manage" },
  { to: "/admin/policy-document", label: "Company Policy", icon: BookOpen },
  { to: "/admin/policy-acknowledgements", label: "Policy Sign-off", icon: ShieldCheck, permission: "policy.acknowledgements.view" },

  // HR-team-internal
  { to: "/admin/hr-tasks", label: "HR Tasks", icon: CheckSquare, hrOnly: true, sectionBreak: true },

  // Personal / self-service
  { to: "/admin/my-leave", label: "My Leave", icon: CalendarPlus, sectionBreak: true },
  { to: "/admin/my-payslip", label: "My Payslip", icon: Receipt },

  // Console administration
  { to: "/admin/team-access", label: "Team Access", icon: Shield, permission: "permissions.manage", sectionBreak: true },
];

// Every navigable section — top-level nav items plus each Reports sub-page
// (which otherwise has no entry in the left panel at all, just a card on
// the Reports hub) — searched by the sidebar box below.
const SECTION_INDEX = [
  ...navItems.map((n) => ({ to: n.to, label: n.label, permission: n.permission, hrOnly: n.hrOnly })),
  ...REPORT_CATEGORIES.flatMap((cat) =>
    cat.items.map((item) => ({ to: item.to, label: item.label, permission: item.permission, group: cat.title })),
  ),
];

// Sidebar search — finds a SECTION (any page in the left panel, including
// Reports sub-pages that don't otherwise appear there) by name, and
// secondarily an employee by name/code, so either "salary paid" or "Nimit"
// typed here jumps straight to the right place.
function SidebarSearch({ user, can, onNavigate }) {
  const [query, setQuery] = useState("");
  const [employees, setEmployees] = useState(null);
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const boxRef = useRef(null);
  const canSearchEmployees = can("employees.view");

  useEffect(() => {
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const loadEmployeesIfNeeded = () => {
    if (canSearchEmployees && employees === null) {
      api.get("/api/employees", { params: { lite: true } }).then(({ data }) => setEmployees(data)).catch(() => setEmployees([]));
    }
  };

  const q = query.trim().toLowerCase();
  const sectionMatches = q
    ? SECTION_INDEX.filter(({ label, permission, hrOnly }) => {
        if (hrOnly && !canSeeHrTasks(user)) return false;
        if (permission && !can(...[].concat(permission))) return false;
        return label.toLowerCase().includes(q);
      }).slice(0, 8)
    : [];
  const employeeMatches = q && employees
    ? employees.filter((e) => `${e.first_name} ${e.last_name}`.toLowerCase().includes(q) || e.employee_code.toLowerCase().includes(q)).slice(0, 6)
    : [];

  const go = (to) => {
    setQuery("");
    setOpen(false);
    navigate(to);
    onNavigate?.();
  };

  return (
    <div ref={boxRef} className="relative px-3 pb-3">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-manila/50" />
        <input
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); loadEmployeesIfNeeded(); }}
          onFocus={() => { setOpen(true); loadEmployeesIfNeeded(); }}
          placeholder="Search sections…"
          aria-label="Search sections"
          className="w-full rounded-sm bg-manila/10 border border-manila/15 pl-8 pr-2 py-2 text-xs text-manila placeholder:text-manila/40 focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
        />
      </div>
      {open && q && (
        <div className="absolute left-3 right-3 mt-1 bg-paper rounded-sm shadow-stamp overflow-hidden z-20 max-h-80 overflow-y-auto">
          {sectionMatches.length === 0 && employeeMatches.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-ink/60">No matches</p>
          ) : (
            <>
              {sectionMatches.length > 0 && (
                <div>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink/50">Sections</p>
                  {sectionMatches.map((s) => (
                    <button
                      key={s.to}
                      type="button"
                      onClick={() => go(s.to)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-manila/50 transition-colors border-b border-ink/[0.06] last:border-0"
                    >
                      <span className="text-ink font-medium">{s.label}</span>
                      {s.group && <span className="ml-1.5 text-[11px] text-ink/50">— {s.group}</span>}
                    </button>
                  ))}
                </div>
              )}
              {employeeMatches.length > 0 && (
                <div>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink/50">Employees</p>
                  {employeeMatches.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => go(`/admin/employees/${e.id}`)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-manila/50 transition-colors border-b border-ink/[0.06] last:border-0"
                    >
                      <span className="text-ink font-medium">{e.first_name} {e.last_name}</span>
                      <span className="block text-[11px] text-ink/60 font-nums">{e.employee_code} · {e.location || "—"}</span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SidebarContent({ user, can, logout, pendingCounts, onNavigate }) {
  const visibleItems = navItems.filter(({ permission, hrOnly }) => {
    if (hrOnly) return canSeeHrTasks(user);
    return permission ? can(...[].concat(permission)) : true;
  });
  const [showPw, setShowPw] = useState(false);
  return (
    <>
      <div className="px-6 py-6 relative flex items-center gap-3">
        <img src="/jade-logo.png" alt="" className="w-9 h-9 flex-shrink-0" />
        <div>
          <p className="font-display text-manila text-xl leading-none">JADE HR</p>
          <p className="text-manila/60 text-[11px] uppercase tracking-[0.2em] mt-1.5">
            {user?.role === "accounts" ? "Accounts Ledger" : "HR Ledger"}
          </p>
        </div>
      </div>
      <SidebarSearch user={user} can={can} onNavigate={onNavigate} />
      <nav className="flex-1 px-3 py-2 space-y-1 relative overflow-y-auto">
        {visibleItems.map(({ to, label, icon: Icon, end, badgeKey, sectionBreak }) => (
          <div key={to} className={sectionBreak ? "mt-3 pt-3 border-t border-manila/10" : ""}>
            <NavLink
              to={to}
              end={end}
              onClick={onNavigate}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-sm text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-manila text-ledger-900"
                    : "text-manila/60 hover:bg-manila/10 hover:text-manila"
                }`
              }
            >
              <Icon size={17} strokeWidth={2} />
              {label}
              {badgeKey && pendingCounts[badgeKey] > 0 && (
                <span className="ml-auto bg-ochre-500 text-ledger-900 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingCounts[badgeKey]}
                </span>
              )}
            </NavLink>
          </div>
        ))}
      </nav>
      <div className="px-3 py-4 relative">
        <div className="border-t border-manila/10 pt-4">
          <div className="px-3 pb-2">
            <p className="text-manila text-sm font-medium">{user?.name}</p>
            <p className="text-manila/60 text-xs font-nums">{user?.employee_code}</p>
          </div>
          <button
            onClick={() => setShowPw(true)}
            className="flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium text-manila/60 hover:bg-manila/10 hover:text-manila w-full transition-colors"
          >
            <KeyRound size={16} />
            Change password
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium text-manila/60 hover:bg-manila/10 hover:text-manila w-full transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </div>
      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}
    </>
  );
}

export default function AdminLayout() {
  const { user, can, logout } = useAuth();
  const [pendingDisputes, setPendingDisputes] = useState([]);
  const [pendingLeave, setPendingLeave] = useState([]);
  const [pendingPayslipApprovals, setPendingPayslipApprovals] = useState([]);
  const [pendingOnboarding, setPendingOnboarding] = useState([]);
  const [pendingWorkAbsence, setPendingWorkAbsence] = useState([]);
  const [pendingWfh, setPendingWfh] = useState([]);
  const [pendingMarketVisits, setPendingMarketVisits] = useState([]);
  const [pendingLoans, setPendingLoans] = useState([]);
  // True once the first poll below has resolved — lets pages seed their own
  // "pending" tab from this data instead of re-fetching it themselves on
  // mount (an empty pending* array is ambiguous with "not fetched yet"
  // otherwise).
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pendingCounts = {
    disputes: pendingDisputes.length, leave: pendingLeave.length,
    payslipApprovals: pendingPayslipApprovals.length, onboarding: pendingOnboarding.length,
    workAbsence: pendingWorkAbsence.length, wfh: pendingWfh.length,
    marketVisits: pendingMarketVisits.length, loans: pendingLoans.length,
  };
  const canDisputes = can("disputes.manage");
  const canLeave = can("leave.manage");
  const canPayslipApprovals = can("payslip_approvals.manage");
  const canOnboarding = can("onboarding.manage");
  const canWorkAbsence = can("absence.manage");
  const canWfh = can("leave.manage", "wfh.approve");
  const canMarketVisits = can("market_visits.review");
  const canLoans = can("loans.manage");

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      Promise.all([
        canDisputes ? api.get("/api/disputes", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
        canLeave ? api.get("/api/leave-requests", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
        canPayslipApprovals ? api.get("/api/payslip-approvals", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
        canOnboarding ? api.get("/api/onboarding/submissions", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
        canWorkAbsence ? api.get("/api/absence-requests", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
        canWfh ? api.get("/api/wfh-requests", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
        canMarketVisits ? api.get("/api/market-visits", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
        canLoans ? api.get("/api/loan-requests", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
      ])
        .then(([disputesRes, leaveRes, payslipApprovalsRes, onboardingRes, workAbsenceRes, wfhRes, marketVisitsRes, loansRes]) => {
          if (cancelled) return;
          setPendingDisputes(disputesRes.data);
          setPendingLeave(leaveRes.data);
          setPendingPayslipApprovals(payslipApprovalsRes.data);
          setPendingOnboarding(onboardingRes.data);
          setPendingWorkAbsence(workAbsenceRes.data);
          setPendingWfh(wfhRes.data);
          setPendingMarketVisits(marketVisitsRes.data);
          setPendingLoans(loansRes.data);
          setPendingLoaded(true);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [canDisputes, canLeave, canPayslipApprovals, canOnboarding, canWorkAbsence, canWfh, canMarketVisits, canLoans]);

  return (
    <div className="h-screen flex bg-manila overflow-hidden">
      {/* Desktop sidebar — fixed height, never scrolls with page content */}
      <aside className="hidden md:flex w-60 h-screen bg-ledger-800 flex-col relative flex-shrink-0">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <SidebarContent user={user} can={can} logout={logout} pendingCounts={pendingCounts} />
      </aside>

      {/* Mobile top bar — Sign out sits here directly (not just inside the
          drawer) to match the employee layout's header, where it's always
          one tap away rather than requiring the menu to be opened first. */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-ledger-800 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="/jade-logo.png" alt="" className="w-7 h-7" />
          <div>
            <span className="font-display text-manila text-lg leading-none block">JADE HR</span>
            <span className="text-manila/60 text-[9px] uppercase tracking-[0.15em] leading-none">
              {user?.role === "accounts" ? "Accounts Ledger" : "HR Ledger"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={logout} aria-label="Sign out" title="Sign out" className="text-manila/70 hover:text-manila p-2">
            <LogOut size={20} />
          </button>
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="text-manila p-1">
            <Menu size={22} />
          </button>
        </div>
      </div>

      {/* Mobile off-canvas drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-ledger-900/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-screen bg-ledger-800 flex flex-col">
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="absolute top-5 right-4 text-manila/70">
              <X size={20} />
            </button>
            <SidebarContent user={user} can={can} logout={logout} pendingCounts={pendingCounts} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="flex-1 p-4 pt-20 md:p-8 md:pt-8 overflow-y-auto overflow-x-hidden max-w-[1400px]">
        <Outlet
          context={{
            pendingDisputes, pendingLeave, pendingPayslipApprovals, pendingOnboarding, pendingWorkAbsence,
            pendingWfh, pendingMarketVisits, pendingLoaded,
          }}
        />
      </main>
    </div>
  );
}
