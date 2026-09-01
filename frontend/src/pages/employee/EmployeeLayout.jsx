import { BookOpen, FileText, Home, KeyRound, LogOut, MapPin, Receipt, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import ChangePasswordModal from "../../components/ChangePasswordModal.jsx";
import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

const POLL_MS = 25000;

export default function EmployeeLayout() {
  const { user, logout } = useAuth();
  const [pendingTeamLeave, setPendingTeamLeave] = useState(0);
  const [showPw, setShowPw] = useState(false);

  const refetchPendingCount = () => {
    if (!user?.is_leave_approver) return;
    api
      .get("/api/me/team-leave-requests", { params: { status: "pending" } })
      .then(({ data }) => setPendingTeamLeave(data.length))
      .catch(() => {});
  };

  useEffect(() => {
    if (!user?.is_leave_approver) return;
    refetchPendingCount();
    const interval = setInterval(refetchPendingCount, POLL_MS);
    return () => clearInterval(interval);
  }, [user?.is_leave_approver]);

  return (
    <div className="min-h-screen bg-manila">
      <header className="bg-ledger-800 relative">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="max-w-4xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-3 relative">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/jade-logo.png" alt="" className="w-8 h-8 flex-shrink-0" />
            <div className="min-w-0">
              <p className="font-display text-manila text-lg leading-none">JADE HR</p>
              <p className="text-manila/60 text-xs mt-1 truncate">{user?.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <button
              onClick={() => setShowPw(true)}
              title="Change password"
              className="flex items-center gap-2 text-sm text-manila/60 hover:text-manila transition-colors whitespace-nowrap"
            >
              <KeyRound size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">Change password</span>
            </button>
            <button
              onClick={logout}
              title="Sign out"
              className="flex items-center gap-2 text-sm text-manila/60 hover:text-manila transition-colors whitespace-nowrap"
            >
              <LogOut size={16} className="flex-shrink-0" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-6 relative">
          <nav className="flex gap-1 -mb-px overflow-x-auto sm:overflow-visible">
            <NavLink
              to="/employee"
              end
              className={({ isActive }) =>
                `flex-shrink-0 whitespace-nowrap sm:flex-shrink sm:whitespace-normal px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive ? "border-manila text-manila" : "border-transparent text-manila/60 hover:text-manila/80"
                }`
              }
            >
              My Dashboard
            </NavLink>
            {user?.is_leave_approver && (
              <NavLink
                to="/employee/team-leave"
                className={({ isActive }) =>
                  `flex flex-shrink-0 items-center gap-2 whitespace-nowrap sm:flex-shrink sm:whitespace-normal px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive ? "border-manila text-manila" : "border-transparent text-manila/60 hover:text-manila/80"
                  }`
                }
              >
                <Users size={14} />
                Team Leave
                {pendingTeamLeave > 0 && (
                  <span className="bg-ochre-500 text-ledger-900 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {pendingTeamLeave}
                  </span>
                )}
              </NavLink>
            )}
            {user?.is_leave_approver && (
              <NavLink
                to="/employee/team-wfh"
                className={({ isActive }) =>
                  `flex flex-shrink-0 items-center gap-2 whitespace-nowrap sm:flex-shrink sm:whitespace-normal px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive ? "border-manila text-manila" : "border-transparent text-manila/60 hover:text-manila/80"
                  }`
                }
              >
                <Home size={14} />
                Team WFH
              </NavLink>
            )}
            {user?.is_leave_approver && (
              <NavLink
                to="/employee/team-market-visits"
                className={({ isActive }) =>
                  `flex flex-shrink-0 items-center gap-2 whitespace-nowrap sm:flex-shrink sm:whitespace-normal px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive ? "border-manila text-manila" : "border-transparent text-manila/60 hover:text-manila/80"
                  }`
                }
              >
                <MapPin size={14} />
                Team Market Visits
              </NavLink>
            )}
            <NavLink
              to="/employee/tax-declaration"
              className={({ isActive }) =>
                `flex flex-shrink-0 items-center gap-2 whitespace-nowrap sm:flex-shrink sm:whitespace-normal px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive ? "border-manila text-manila" : "border-transparent text-manila/60 hover:text-manila/80"
                }`
              }
            >
              <Receipt size={14} />
              Tax Declaration
            </NavLink>
            <NavLink
              to="/employee/my-payslip"
              className={({ isActive }) =>
                `flex flex-shrink-0 items-center gap-2 whitespace-nowrap sm:flex-shrink sm:whitespace-normal px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive ? "border-manila text-manila" : "border-transparent text-manila/60 hover:text-manila/80"
                }`
              }
            >
              <FileText size={14} />
              My Payslip
            </NavLink>
            <NavLink
              to="/employee/policy"
              className={({ isActive }) =>
                `flex flex-shrink-0 items-center gap-2 whitespace-nowrap sm:flex-shrink sm:whitespace-normal px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive ? "border-manila text-manila" : "border-transparent text-manila/60 hover:text-manila/80"
                }`
              }
            >
              <BookOpen size={14} />
              Company Policy
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Outlet context={{ pendingTeamLeave, refreshTeamLeaveBadge: () => setPendingTeamLeave((n) => n) }} />
      </main>
      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}
    </div>
  );
}
