import { Briefcase, CalendarDays, CalendarPlus, ClipboardList, FileBarChart, FileText, Flag, KeyRound, LayoutDashboard, LogOut, Menu, Plane, Receipt, Shield, Stamp, UserPlus, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import ChangePasswordModal from "../../components/ChangePasswordModal.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

const POLL_MS = 25000;

const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/employees", label: "Employees", icon: Users, permission: "employees.view" },
  { to: "/admin/onboarding", label: "Onboarding", icon: UserPlus, badgeKey: "onboarding", permission: "onboarding.manage" },
  { to: "/admin/payroll", label: "Payroll & OT", icon: Receipt, permission: "payroll.view" },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart, permission: "payroll.view" },
  { to: "/admin/disputes", label: "Disputes", icon: Flag, badgeKey: "disputes", permission: "disputes.manage" },
  { to: "/admin/leave", label: "Leave", icon: Plane, badgeKey: "leave", permission: "leave.manage" },
  { to: "/admin/work-absence", label: "Work Absence", icon: Briefcase, badgeKey: "workAbsence", permission: "absence.manage" },
  { to: "/admin/leave-entry", label: "Leave Entry", icon: ClipboardList, permission: "leave.manage" },
  { to: "/admin/payslip-approvals", label: "Payslip Approvals", icon: Stamp, badgeKey: "payslipApprovals", permission: "payslip_approvals.manage" },
  { to: "/admin/letters", label: "Letters", icon: FileText, permission: ["letters.generate", "letters.manage"] },
  { to: "/admin/policy", label: "Leave Policy", icon: CalendarDays, permission: ["employees.manage", "policy.manage"] },
  { to: "/admin/my-leave", label: "My Leave", icon: CalendarPlus, sectionBreak: true },
  { to: "/admin/my-payslip", label: "My Payslip", icon: Receipt },
  { to: "/admin/team-access", label: "Team Access", icon: Shield, permission: "permissions.manage" },
];

function SidebarContent({ user, can, logout, pendingCounts, onNavigate }) {
  const visibleItems = navItems.filter(({ permission }) => (permission ? can(...[].concat(permission)) : true));
  const [showPw, setShowPw] = useState(false);
  return (
    <>
      <div className="px-6 py-6 relative flex items-center gap-3">
        <img src="/jade-logo.png" alt="" className="w-9 h-9 flex-shrink-0" />
        <div>
          <p className="font-display text-manila text-xl leading-none">JADE HR</p>
          <p className="text-manila/40 text-[11px] uppercase tracking-[0.2em] mt-1.5">
            {user?.role === "accounts" ? "Accounts Ledger" : "HR Ledger"}
          </p>
        </div>
      </div>
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
            <p className="text-manila/40 text-xs font-nums">{user?.employee_code}</p>
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
  // True once the first poll below has resolved — lets pages seed their own
  // "pending" tab from this data instead of re-fetching it themselves on
  // mount (an empty pending* array is ambiguous with "not fetched yet"
  // otherwise).
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pendingCounts = {
    disputes: pendingDisputes.length, leave: pendingLeave.length,
    payslipApprovals: pendingPayslipApprovals.length, onboarding: pendingOnboarding.length,
    workAbsence: pendingWorkAbsence.length,
  };
  const canDisputes = can("disputes.manage");
  const canLeave = can("leave.manage");
  const canPayslipApprovals = can("payslip_approvals.manage");
  const canOnboarding = can("onboarding.manage");
  const canWorkAbsence = can("absence.manage");

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      Promise.all([
        canDisputes ? api.get("/api/disputes", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
        canLeave ? api.get("/api/leave-requests", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
        canPayslipApprovals ? api.get("/api/payslip-approvals", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
        canOnboarding ? api.get("/api/onboarding/submissions", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
        canWorkAbsence ? api.get("/api/absence-requests", { params: { status: "pending" } }) : Promise.resolve({ data: [] }),
      ])
        .then(([disputesRes, leaveRes, payslipApprovalsRes, onboardingRes, workAbsenceRes]) => {
          if (cancelled) return;
          setPendingDisputes(disputesRes.data);
          setPendingLeave(leaveRes.data);
          setPendingPayslipApprovals(payslipApprovalsRes.data);
          setPendingOnboarding(onboardingRes.data);
          setPendingWorkAbsence(workAbsenceRes.data);
          setPendingLoaded(true);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [canDisputes, canLeave, canPayslipApprovals, canOnboarding, canWorkAbsence]);

  return (
    <div className="h-screen flex bg-manila overflow-hidden">
      {/* Desktop sidebar — fixed height, never scrolls with page content */}
      <aside className="hidden md:flex w-60 h-screen bg-ledger-800 flex-col relative flex-shrink-0">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <SidebarContent user={user} can={can} logout={logout} pendingCounts={pendingCounts} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-ledger-800 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="/jade-logo.png" alt="" className="w-7 h-7" />
          <span className="font-display text-manila text-lg leading-none">JADE HR</span>
        </div>
        <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="text-manila p-1">
          <Menu size={22} />
        </button>
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
            pendingLoaded,
          }}
        />
      </main>
    </div>
  );
}
