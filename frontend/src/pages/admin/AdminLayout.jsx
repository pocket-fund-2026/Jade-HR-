import { ChevronDown, GraduationCap, Briefcase, Gauge, BookOpen, CalendarCheck, CalendarClock, CalendarDays, CalendarPlus, CheckSquare, ClipboardList, DoorOpen, FileBarChart, FileText, Flag, GitBranch, HelpCircle, Home, KeyRound, LayoutDashboard, LogOut, Mail, ReceiptText, MapPin, Menu, Network, Plane, Receipt, Search, Shield, ShieldAlert, ShieldCheck, Stamp, UserPlus, Users, Users2, Wallet, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDrawerDrag } from "../../lib/useDrawerDrag.js";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import Avatar from "../../components/Avatar.jsx";
import ChangePasswordModal from "../../components/ChangePasswordModal.jsx";
import { hasUnseenSignoff } from "../../lib/exitPopup.js";
import ExitSignoffModal from "../../components/ExitSignoffModal.jsx";
import PendingSignaturesModal from "../../components/PendingSignaturesModal.jsx";
import NotificationBell, { NotificationToasts } from "../../components/NotificationCenter.jsx";
import { ConfirmProvider } from "../../components/ConfirmDialog.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { canSeeHrTasks } from "../../lib/hrTasksAccess.js";
import { REPORT_CATEGORIES } from "../../lib/reportsCatalog.js";

const POLL_MS = 25000;

const navItems = [
  // Overview
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },

  // People — headcount, hiring, absence
  { to: "/admin/employees", label: "Employees", icon: Users, permission: "employees.view", group: "People" },
  { to: "/admin/org-chart", label: "Org chart", icon: Network, permission: "employees.view", group: "People" },
  { to: "/admin/reporting-managers", label: "Reporting managers", icon: GitBranch, permission: "employees.manage", group: "People" },
  { to: "/admin/onboarding", label: "Onboarding", icon: UserPlus, badgeKey: "onboarding", permission: "onboarding.manage", group: "People" },
  { to: "/admin/careers", label: "Careers", icon: Users2, badgeKey: "careers", permission: "careers.manage", group: "People" },
  { to: "/admin/work-absence", label: "Work Absence", icon: Briefcase, badgeKey: "workAbsence", permission: "absence.manage", group: "People" },
  { to: "/admin/confirmations", label: "Confirmations", icon: CalendarCheck, permission: "employees.manage", group: "People" },
  { to: "/admin/exit", label: "Exit procedure", icon: DoorOpen, badgeKey: "accessRevoke", permission: "exit.manage", group: "People" },

  // Time & Leave — requests, tracking, policy
  { to: "/admin/leave", label: "Leave", icon: Plane, badgeKey: "leave", permission: "leave.manage", sectionBreak: true, group: "Time & Leave" },
  { to: "/admin/all-requests", label: "All requests", icon: ClipboardList, nimitOnly: true, sectionBreak: true, group: "Time & Leave" },
  { to: "/admin/leave-entry", label: "Leave entry", icon: ClipboardList, permission: "leave.manage", group: "Time & Leave" },
  { to: "/admin/wfh-requests", label: "WFH Requests", icon: Home, badgeKey: "wfh", permission: ["leave.manage", "wfh.approve"], group: "Time & Leave" },
  { to: "/admin/market-visits", label: "Market Visits", icon: MapPin, badgeKey: "marketVisits", permission: "market_visits.review", group: "Time & Leave" },
  { to: "/admin/comp-off", label: "Comp-Off", icon: CalendarClock, permission: ["employees.manage", "policy.manage", "comp_off.manage"], group: "Time & Leave" },
  { to: "/admin/aip", label: "AIP", icon: ShieldAlert, permission: "leave.manage", group: "Time & Leave" },
  { to: "/admin/policy", label: "Leave policy", icon: CalendarDays, permission: ["employees.manage", "policy.manage", "comp_off.manage"], group: "Time & Leave" },

  // Payroll & Finance
  { to: "/admin/payroll", label: "Payroll & OT", icon: Receipt, permission: "payroll.view", sectionBreak: true, group: "Payroll & Finance" },
  { to: "/admin/payslip-approvals", label: "Payslip approvals", icon: Stamp, badgeKey: "payslipApprovals", permission: "payslip_approvals.manage", group: "Payroll & Finance" },
  { to: "/admin/reports", label: "Reports", icon: FileBarChart, permission: ["payroll.view", "attendance.restricted_reports"], group: "Payroll & Finance" },
  { to: "/admin/loans", label: "Loan requests", icon: Wallet, badgeKey: "loans", permission: "loans.manage", group: "Payroll & Finance" },

  // Documents & Compliance
  { to: "/admin/invoices", label: "Invoices", icon: ReceiptText, permission: ["invoices.view", "invoices.reconcile"], group: "Payroll & Finance" },
  { to: "/admin/letters", label: "Letters", icon: FileText, permission: ["letters.generate", "letters.manage"], sectionBreak: true, group: "Documents" },
  { to: "/admin/data-readiness", label: "Data readiness", icon: Gauge, permission: "data_readiness.view", group: "Documents" },
  { to: "/admin/email-log", label: "Email log", icon: Mail, permission: "email_log.view", group: "Documents" },
  { to: "/admin/disputes", label: "Disputes", icon: Flag, badgeKey: "disputes", permission: "disputes.manage", group: "Documents" },
  { to: "/admin/policy-document", label: "Company policy", icon: BookOpen, group: "Documents" },
  { to: "/admin/policy-acknowledgements", label: "Policy Sign-off", icon: ShieldCheck, permission: "policy.acknowledgements.view", group: "Documents" },

  // HR-team-internal
  { to: "/admin/hr-tasks", label: "HR Tasks", icon: CheckSquare, hrOnly: true, sectionBreak: true, group: "HR team" },

  // Personal / self-service
  // requiresApprover items only show for a login who is actually someone's
  // leave approver / reporting manager (is_leave_approver from /api/auth/me)
  // — an HR/Accounts login CAN be set as an employee's approver (the picker
  // on Employees doesn't restrict by role) but, unlike a role:"employee"
  // login, has no /employee/* console to see that team in — these reuse the
  // exact same pages (My Team / Team Leave / Team WFH / Team Market Visits)
  // under /admin/* instead, so that assignment actually works.
  { to: "/admin/my-team", label: "My team", icon: Users2, requiresApprover: true, sectionBreak: true, group: "My account & team" },
  { to: "/admin/team-leave", label: "Team leave", icon: Plane, requiresApprover: true, group: "My account & team" },
  { to: "/admin/team-wfh", label: "Team WFH", icon: Home, requiresApprover: true, group: "My account & team" },
  { to: "/admin/team-disputes", label: "Team disputes", icon: ShieldAlert, requiresApprover: true, group: "My account & team" },
  { to: "/admin/team-market-visits", label: "Team market visits", icon: MapPin, requiresApprover: true, group: "My account & team" },
  { to: "/admin/department", label: "Change decisions", icon: ShieldAlert, requiresHead: true, group: "My account & team" },
  { to: "/admin/my-leave", label: "My leave", icon: CalendarPlus, group: "My account & team" },
  { to: "/admin/my-absence", label: "My work absence", icon: Briefcase, group: "My account & team" },
  { to: "/admin/my-payslip", label: "My payslip", icon: Receipt, group: "My account & team" },
  { to: "/admin/help", label: "Help", icon: HelpCircle, group: "My account & team" },

  // Console administration
  { to: "/admin/team-access", label: "Team access", icon: Shield, permission: ["permissions.manage", "roles.manage"], sectionBreak: true, group: "Admin" },
];

// Every navigable section — top-level nav items plus each Reports sub-page
// (which otherwise has no entry in the left panel at all, just a card on
// the Reports hub) — searched by the sidebar box below.
const SECTION_INDEX = [
  ...navItems.map((n) => ({ to: n.to, label: n.label, permission: n.permission, hrOnly: n.hrOnly, requiresApprover: n.requiresApprover, requiresHead: n.requiresHead, nimitOnly: n.nimitOnly })),
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
    ? SECTION_INDEX.filter(({ label, permission, hrOnly, requiresApprover, requiresHead, nimitOnly }) => {
        if (hrOnly && !canSeeHrTasks(user)) return false;
        if (nimitOnly && !(user?.employee_code === "14456" || can("requests.view_all"))) return false;
        if (requiresApprover && !user?.is_leave_approver) return false;
    if (requiresHead && !user?.is_dept_head) return false;
        if (requiresHead && !user?.is_dept_head) return false;
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
          className="w-full rounded-sm bg-manila/10 border border-manila/15 pl-8 pr-2 py-2 min-h-[44px] md:min-h-0 text-base md:text-xs text-manila placeholder:text-manila/55 focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
        />
      </div>
      {open && q && (
        <div className="pop-in absolute left-3 right-3 mt-1 bg-paper rounded-sm shadow-stamp overflow-hidden z-20 max-h-80 overflow-y-auto">
          {sectionMatches.length === 0 && employeeMatches.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-ink/60">No matches</p>
          ) : (
            <>
              {sectionMatches.length > 0 && (
                <div>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-ink/50">Sections</p>
                  {sectionMatches.map((s) => (
                    <button
                      key={s.to}
                      type="button"
                      onClick={() => go(s.to)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-manila/50 active:bg-manila/70 transition-colors min-h-[44px] md:min-h-0 border-b border-ink/[0.06] last:border-0"
                    >
                      <span className="text-ink font-medium">{s.label}</span>
                      {s.group && <span className="ml-1.5 text-[11px] text-ink/50">— {s.group}</span>}
                    </button>
                  ))}
                </div>
              )}
              {employeeMatches.length > 0 && (
                <div>
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold text-ink/50">Employees</p>
                  {employeeMatches.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => go(`/admin/employees/${e.id}`)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-manila/50 active:bg-manila/70 transition-colors min-h-[44px] md:min-h-0 border-b border-ink/[0.06] last:border-0"
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

function SidebarContent({ user, can, logout, pendingCounts, onNavigate, bell }) {
  const visibleItems = navItems.filter(({ permission, hrOnly, requiresApprover, requiresHead, nimitOnly }) => {
    if (hrOnly) return canSeeHrTasks(user);
    if (nimitOnly && !(user?.employee_code === "14456" || can("requests.view_all"))) return false;
    if (requiresApprover && !user?.is_leave_approver) return false;
    return permission ? can(...[].concat(permission)) : true;
  });
  const [showPw, setShowPw] = useState(false);
  const { pathname } = useLocation();
  // Sidebar sections can be folded; the choice is remembered per browser. A section holding the
  // page you are on always stays open.
  const [collapsed, setCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("jadehr.nav.collapsed") || "[]"); } catch { return []; }
  });
  const toggleGroup = (name) => setCollapsed((c) => {
    const next = c.includes(name) ? c.filter((x) => x !== name) : [...c, name];
    try { localStorage.setItem("jadehr.nav.collapsed", JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  });
  const groups = [];
  for (const item of visibleItems) {
    const name = item.group || "";
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.items.push(item); else groups.push({ name, items: [item] });
  }
  return (
    <>
      <div className="px-6 py-6 relative flex items-center gap-4">
        <img src="/jade-logo.png" alt="" className="w-9 h-9 flex-shrink-0" />
        <div className="min-w-0">
          <p className="font-display text-manila text-xl leading-none">JADE HR</p>
          <p className="text-manila/75 text-[11px] mt-1.5">
            {user?.role === "accounts" ? "Accounts Ledger" : "HR Ledger"}
          </p>
        </div>
        {bell && <div className="ml-auto -mr-2">{bell}</div>}
      </div>
      <SidebarSearch user={user} can={can} onNavigate={onNavigate} />
      <nav className="flex-1 px-3 py-2 space-y-0.5 relative overflow-y-auto nav-scroll overscroll-contain">
        {groups.map(({ name, items }) => {
          const hasActive = items.some((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to)));
          const isOpen = !name || !collapsed.includes(name) || hasActive;
          const groupBadge = items.reduce((n, i) => n + (i.badgeKey ? pendingCounts[i.badgeKey] || 0 : 0), 0);
          return (
            <div key={name || "top"} className={name ? "mt-3 pt-3 border-t border-manila/10" : ""}>
              {name && (
                <button
                  type="button" aria-expanded={isOpen} onClick={() => toggleGroup(name)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] font-semibold text-manila/60 hover:text-manila"
                >
                  <ChevronDown size={12} className={`transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                  <span>{name}</span>
                  {!isOpen && groupBadge > 0 && (
                    <span className="ml-auto bg-ochre-500 text-ledger-900 text-[10px] font-bold rounded-full min-w-5 h-5 px-1 flex items-center justify-center">{groupBadge}</span>
                  )}
                </button>
              )}
              {isOpen && items.map(({ to, label, icon: Icon, end, badgeKey }) => (
                <div key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-4 px-[1.5em] py-[0.625em] leading-tight min-h-[44px] md:min-h-0 rounded-md text-sm font-medium transition-all duration-150 ${
                        isActive
                          ? "bg-manila text-ledger-900 shadow-sm before:absolute before:left-0 before:top-2 before:bottom-2 before:w-[3px] before:rounded-r before:bg-jade-500"
                          : "text-white/75 hover:bg-manila/10 hover:text-white hover:translate-x-0.5"
                      }`
                    }
                  >
                    <Icon size={17} strokeWidth={2} className="flex-shrink-0 opacity-90 group-hover:opacity-100" />
                    <span className="truncate">{label}</span>
                    {badgeKey && pendingCounts[badgeKey] > 0 && (
                      <span key={pendingCounts[badgeKey]} className="t-pop ml-auto bg-ochre-500 text-ledger-900 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                        {pendingCounts[badgeKey]}
                      </span>
                    )}
                  </NavLink>
                </div>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="px-3 py-4 relative">
        <div className="border-t border-manila/10 pt-4">
          <div className="px-3 pb-3 flex items-center gap-4">
            <Avatar className="w-10 h-10" />
            <div className="min-w-0">
              <p className="text-manila text-sm font-medium truncate">{user?.name}</p>
              <p className="text-manila/75 text-xs font-nums">{user?.employee_code}</p>
            </div>
          </div>
          <button
            onClick={() => setShowPw(true)}
            className="flex items-center gap-4 px-3 py-2 min-h-[44px] md:min-h-0 rounded-md text-sm font-medium text-manila/75 hover:bg-manila/10 hover:text-manila w-full transition-colors"
          >
            <KeyRound size={16} />
            Change password
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-4 px-3 py-2 min-h-[44px] md:min-h-0 rounded-md text-sm font-medium text-manila/75 hover:bg-manila/10 hover:text-manila w-full transition-colors"
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

// Exit-clearance e-sign prompt for console users (e.g. Head-HR) who are a
// named sign-off owner — same list the employee dashboard shows.
function ExitSignoffPrompt({ user }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const poll = () => api.get("/api/me/exit-signoffs").then(({ data }) => {
      setItems(data);
      if (hasUnseenSignoff(data)) setOpen(true);
    }).catch(() => {});
    poll();
    const t = setInterval(poll, 60000); // a sign-off HR assigns mid-session pops up within a minute
    return () => clearInterval(t);
  }, []);
  if (!items.length) return null;
  return (
    <>
      <div className="bg-rust-50 border border-rust-500/40 rounded-sm px-4 py-3 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="text-sm text-ink/80">
          <strong className="text-ink">Exit clearance</strong> — {items.length === 1 ? `${items[0].employee_name} is leaving and` : `${items.length} people are leaving and`} needs your e-sign.
        </div>
        <button onClick={() => setOpen(true)} className="bg-ledger-800 text-manila px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-ledger-700 transition-colors whitespace-nowrap self-start sm:self-auto">
          Review &amp; sign
        </button>
      </div>
      {open && (
        <ExitSignoffModal items={items} fullName={user?.name || ""} onClose={() => setOpen(false)} onChanged={(left) => { setItems(left); if (!left.length) setOpen(false); }} />
      )}
    </>
  );
}

export default function AdminLayout() {
  const { user, can, logout } = useAuth();
  const location = useLocation();
  const [pendingDisputes, setPendingDisputes] = useState([]);
  const [pendingLeave, setPendingLeave] = useState([]);
  const [pendingPayslipApprovals, setPendingPayslipApprovals] = useState([]);
  const [pendingOnboarding, setPendingOnboarding] = useState([]);
  const [pendingCareers, setPendingCareers] = useState([]);
  const [pendingWorkAbsence, setPendingWorkAbsence] = useState([]);
  const [pendingWfh, setPendingWfh] = useState([]);
  const [pendingMarketVisits, setPendingMarketVisits] = useState([]);
  const [pendingLoans, setPendingLoans] = useState([]);
  const [pendingNewEmployees, setPendingNewEmployees] = useState([]);
  const [pendingAccessRevoke, setPendingAccessRevoke] = useState([]);
  // True once the first poll below has resolved — lets pages seed their own
  // "pending" tab from this data instead of re-fetching it themselves on
  // mount (an empty pending* array is ambiguous with "not fetched yet"
  // otherwise).
  const [pendingLoaded, setPendingLoaded] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const closeDrawer = useCallback(() => setMobileOpen(false), []);
  const drawerRef = useDrawerDrag(closeDrawer, mobileOpen);
  const pendingCounts = {
    disputes: pendingDisputes.length, leave: pendingLeave.length,
    payslipApprovals: pendingPayslipApprovals.length, onboarding: pendingOnboarding.length,
    workAbsence: pendingWorkAbsence.length, wfh: pendingWfh.length,
    marketVisits: pendingMarketVisits.length, loans: pendingLoans.length,
    careers: pendingCareers.length, accessRevoke: pendingAccessRevoke.length,
  };
  const pendingByType = useMemo(() => ({
    leave: pendingLeave, disputes: pendingDisputes, payslipApprovals: pendingPayslipApprovals,
    onboarding: pendingOnboarding, workAbsence: pendingWorkAbsence, wfh: pendingWfh,
    marketVisits: pendingMarketVisits, loans: pendingLoans, careers: pendingCareers, newEmployees: pendingNewEmployees, accessRevoke: pendingAccessRevoke,
  }), [pendingAccessRevoke, pendingLeave, pendingDisputes, pendingPayslipApprovals, pendingOnboarding, pendingWorkAbsence, pendingWfh, pendingMarketVisits, pendingLoans, pendingCareers, pendingNewEmployees]);
  const canDisputes = can("disputes.manage");
  const canLeave = can("leave.manage");
  const canPayslipApprovals = can("payslip_approvals.manage");
  const canOnboarding = can("onboarding.manage");
  const canWorkAbsence = can("absence.manage");
  const canWfh = can("leave.manage", "wfh.approve");
  const canMarketVisits = can("market_visits.review");
  const canLoans = can("loans.manage");
  const canCareers = can("careers.manage");
  const canNewEmployees = can("employees.view");
  const canExit = can("exit.manage");

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
        canCareers ? api.get("/api/careers/applications", { params: { status: "New" } }) : Promise.resolve({ data: [] }),
        canNewEmployees ? api.get("/api/employees/recent-additions") : Promise.resolve({ data: [] }),
        canExit ? api.get("/api/exit-records/access-pending") : Promise.resolve({ data: [] }),
      ])
        .then(([disputesRes, leaveRes, payslipApprovalsRes, onboardingRes, workAbsenceRes, wfhRes, marketVisitsRes, loansRes, careersRes, newEmployeesRes, accessRevokeRes]) => {
          if (cancelled) return;
          setPendingDisputes(disputesRes.data);
          setPendingLeave(leaveRes.data);
          setPendingPayslipApprovals(payslipApprovalsRes.data);
          setPendingOnboarding(onboardingRes.data);
          setPendingWorkAbsence(workAbsenceRes.data);
          setPendingWfh(wfhRes.data);
          setPendingMarketVisits(marketVisitsRes.data);
          setPendingLoans(loansRes.data);
          setPendingNewEmployees(newEmployeesRes.data);
          setPendingAccessRevoke(accessRevokeRes.data);
          // careers rows carry SQLite UTC timestamps ("YYYY-MM-DD HH:MM:SS");
          // normalise to ISO so the dashboard's "since last seen" compare works.
          setPendingCareers((careersRes.data || []).map((a) => ({ ...a, created_at: String(a.created_at).replace(" ", "T") + "Z" })));
          setPendingLoaded(true);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, [canDisputes, canLeave, canPayslipApprovals, canOnboarding, canWorkAbsence, canWfh, canMarketVisits, canLoans, canCareers, canNewEmployees]);

  return (
    <div className="h-screen flex bg-manila overflow-hidden">
      <NotificationToasts pending={pendingByType} loaded={pendingLoaded} />
      {/* Desktop sidebar — fixed height, never scrolls with page content */}
      <aside className="hidden md:flex w-60 h-screen bg-ledger-800 flex-col relative flex-shrink-0">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <SidebarContent
          user={user} can={can} logout={logout} pendingCounts={pendingCounts}
          bell={<NotificationBell pending={pendingByType} variant="sidebar" />}
        />
      </aside>

      {/* Mobile top bar — Sign out sits here directly (not just inside the
          drawer) to match the employee layout’s header, where it’s always
          one tap away rather than requiring the menu to be opened first. */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-ledger-800 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="/jade-logo.png" alt="" className="w-7 h-7" />
          <div>
            <span className="font-display text-manila text-lg leading-none block">JADE HR</span>
            <span className="text-manila/75 text-[9px] leading-none">
              {user?.role === "accounts" ? "Accounts Ledger" : "HR Ledger"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <NotificationBell pending={pendingByType} variant="mobile" />
          <button onClick={logout} aria-label="Sign out" title="Sign out" className="text-manila/80 hover:text-manila w-11 h-11 flex items-center justify-center">
            <LogOut size={20} />
          </button>
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu" className="text-manila w-11 h-11 flex items-center justify-center -mr-1">
            <Menu size={22} />
          </button>
        </div>
      </div>

      {/* Mobile off-canvas drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-ledger-900/60" onClick={() => setMobileOpen(false)} />
          <aside ref={drawerRef} className="drawer-in relative touch-pan-y w-64 max-w-[85vw] h-screen bg-ledger-800 flex flex-col">
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu" className="absolute top-3 right-3 w-11 h-11 flex items-center justify-center text-manila/80 hover:text-manila">
              <X size={20} />
            </button>
            <SidebarContent user={user} can={can} logout={logout} pendingCounts={pendingCounts} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="flex-1 px-5 pb-4 pt-20 md:px-12 md:py-8 overflow-y-auto overflow-x-hidden max-w-[1400px]">
        <ConfirmProvider>
          <ExitSignoffPrompt user={user} />
          <div key={location.pathname} className="page-transition">
          <Outlet
            context={{
              pendingDisputes, pendingLeave, pendingPayslipApprovals, pendingOnboarding, pendingWorkAbsence,
              pendingWfh, pendingMarketVisits, pendingCareers, pendingAccessRevoke, pendingLoaded,
            }}
          />
          </div>
          <PendingSignaturesModal />
        </ConfirmProvider>
      </main>
    </div>
  );
}
