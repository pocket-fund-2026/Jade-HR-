import { LogOut, Receipt, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

const POLL_MS = 25000;

export default function EmployeeLayout() {
  const { user, logout } = useAuth();
  const [pendingTeamLeave, setPendingTeamLeave] = useState(0);

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
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between relative">
          <div className="flex items-center gap-3">
            <img src="/jade-logo.png" alt="" className="w-8 h-8 flex-shrink-0" />
            <div>
              <p className="font-display text-manila text-lg leading-none">JADE HR</p>
              <p className="text-manila/40 text-xs mt-1">{user?.name}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-manila/60 hover:text-manila transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-6 relative">
          <nav className="flex gap-1 -mb-px">
            <NavLink
              to="/employee"
              end
              className={({ isActive }) =>
                `px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive ? "border-manila text-manila" : "border-transparent text-manila/50 hover:text-manila/80"
                }`
              }
            >
              My Dashboard
            </NavLink>
            {user?.is_leave_approver && (
              <NavLink
                to="/employee/team-leave"
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive ? "border-manila text-manila" : "border-transparent text-manila/50 hover:text-manila/80"
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
            <NavLink
              to="/employee/tax-declaration"
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive ? "border-manila text-manila" : "border-transparent text-manila/50 hover:text-manila/80"
                }`
              }
            >
              <Receipt size={14} />
              Tax Declaration
            </NavLink>
          </nav>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Outlet context={{ pendingTeamLeave, refreshTeamLeaveBadge: () => setPendingTeamLeave((n) => n) }} />
      </main>
    </div>
  );
}
