import { BookOpen, CalendarClock, FileText, Gavel, HelpCircle, KeyRound, LayoutDashboard, LogOut, Receipt, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import Avatar from "../../components/Avatar.jsx";
import ChangePasswordModal from "../../components/ChangePasswordModal.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

const POLL_MS = 25000;
const TEAM_PATHS = ["/employee/my-team", "/employee/team-leave", "/employee/team-wfh", "/employee/team-disputes", "/employee/team-market-visits"];

function NavItem({ to, end, icon: Icon, children, badge, forceActive }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-shrink-0 items-center gap-2 whitespace-nowrap px-3 min-h-[44px] text-sm font-medium border-b-2 transition-colors ${
          isActive || forceActive ? "border-manila text-manila" : "border-transparent text-manila/70 hover:text-manila"
        }`
      }
    >
      {Icon && <Icon size={14} className="flex-shrink-0" />}
      {children}
      {badge > 0 && (
        <span key={badge} className="t-pop bg-ochre-500 text-ledger-900 text-[10px] font-bold rounded-full min-w-[20px] h-5 px-1 flex items-center justify-center font-nums">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </NavLink>
  );
}

export default function EmployeeLayout() {
  const location = useLocation();
  const { user, logout } = useAuth();
  const [pendingTeam, setPendingTeam] = useState({ leave: 0, disputes: 0, visits: 0 });
  const [showPw, setShowPw] = useState(false);
  const [interviewer, setInterviewer] = useState(false);

  // Reporting managers and store managers can interview candidates, so they get "Interviews" to manage their own slots.
  useEffect(() => {
    api.get("/api/careers/interviewers/me").then(({ data }) => setInterviewer(!!data.eligible)).catch(() => {});
  }, []);

  // One poll for everything a manager has waiting, so the "My team" tab and
  // the team sub-menu both show live counts.
  const refetchPendingCount = () => {
    if (!user?.is_leave_approver) return;
    Promise.all([
      api.get("/api/me/team-leave-requests", { params: { status: "pending" } }).then(({ data }) => data.length).catch(() => null),
      api.get("/api/me/team-disputes", { params: { status: "pending" } }).then(({ data }) => data.length).catch(() => null),
      api.get("/api/market-visits/my-team", { params: { status: "pending" } }).then(({ data }) => data.length).catch(() => null),
    ]).then(([leave, disputes, visits]) => setPendingTeam((p) => ({
      leave: leave ?? p.leave, disputes: disputes ?? p.disputes, visits: visits ?? p.visits,
    })));
  };

  useEffect(() => {
    if (!user?.is_leave_approver) return;
    refetchPendingCount();
    const interval = setInterval(refetchPendingCount, POLL_MS);
    return () => clearInterval(interval);
  }, [user?.is_leave_approver]);

  const teamTotal = pendingTeam.leave + pendingTeam.disputes + pendingTeam.visits;
  const inTeam = TEAM_PATHS.some((p) => location.pathname.startsWith(p));

  return (
    <div className="min-h-screen bg-manila">
      <header className="bg-ledger-800 relative">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3 relative">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/jade-logo.png" alt="" className="w-8 h-8 flex-shrink-0" />
            <Avatar className="w-10 h-10 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-display text-manila text-lg leading-none">JADE HR</p>
              <p className="text-manila/75 text-xs mt-1 truncate">{user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
            <button
              onClick={() => setShowPw(true)}
              title="Change password"
              aria-label="Change password"
              className="flex items-center gap-2 text-sm min-h-[44px] px-2 text-manila/75 hover:text-manila transition-colors whitespace-nowrap"
            >
              <KeyRound size={16} className="flex-shrink-0" />
              <span className="hidden md:inline">Change password</span>
            </button>
            <button
              onClick={logout}
              title="Sign out"
              aria-label="Sign out"
              className="flex items-center gap-2 text-sm min-h-[44px] px-2 text-manila/75 hover:text-manila transition-colors whitespace-nowrap"
            >
              <LogOut size={16} className="flex-shrink-0" />
              <span className="hidden md:inline">Sign out</span>
            </button>
          </div>
        </div>
        <div className="max-w-6xl mx-auto relative">
          <nav className="flex -mb-px overflow-x-auto nav-scroll px-2 sm:px-4" aria-label="Main">
            <NavItem to="/employee" end icon={LayoutDashboard}>My dashboard</NavItem>
            {user?.is_leave_approver && (
              <NavItem to="/employee/my-team" icon={Users} badge={teamTotal} forceActive={inTeam}>My team</NavItem>
            )}
            {user?.is_dept_head && <NavItem to="/employee/department" icon={Gavel}>Change decisions</NavItem>}
            {interviewer && <NavItem to="/employee/interview-availability" icon={CalendarClock}>Interviews</NavItem>}
            <NavItem to="/employee/my-payslip" icon={FileText}>My payslip</NavItem>
            <NavItem to="/employee/tax-declaration" icon={Receipt}>Tax declaration</NavItem>
            <NavItem to="/employee/my-onboarding" icon={UserPlus}>My onboarding</NavItem>
            <NavItem to="/employee/policy" icon={BookOpen}>Policy</NavItem>
            <NavItem to="/employee/help" icon={HelpCircle}>Help</NavItem>
          </nav>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div key={location.pathname} className="page-transition">
          <Outlet context={{ pendingTeam, pendingTeamLeave: pendingTeam.leave, refetchPendingCount, refreshTeamLeaveBadge: refetchPendingCount }} />
        </div>
      </main>
      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}
    </div>
  );
}
