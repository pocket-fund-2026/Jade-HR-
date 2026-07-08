import { Flag, LayoutDashboard, LogOut, Menu, Plane, Receipt, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

const POLL_MS = 25000;

const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/employees", label: "Employees", icon: Users },
  { to: "/admin/payroll", label: "Payroll & OT", icon: Receipt },
  { to: "/admin/disputes", label: "Disputes", icon: Flag, badgeKey: "disputes" },
  { to: "/admin/leave", label: "Leave", icon: Plane, badgeKey: "leave" },
];

function SidebarContent({ user, logout, pendingCounts, onNavigate }) {
  return (
    <>
      <div className="px-6 py-6 relative flex items-center gap-3">
        <img src="/jade-logo.png" alt="" className="w-9 h-9 flex-shrink-0" />
        <div>
          <p className="font-display text-manila text-xl leading-none">JADE HR</p>
          <p className="text-manila/40 text-[11px] uppercase tracking-[0.2em] mt-1.5">Admin Ledger</p>
        </div>
      </div>
      <nav className="flex-1 px-3 py-2 space-y-1 relative">
        {navItems.map(({ to, label, icon: Icon, end, badgeKey }) => (
          <NavLink
            key={to}
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
        ))}
      </nav>
      <div className="px-3 py-4 relative">
        <div className="border-t border-manila/10 pt-4">
          <div className="px-3 pb-2">
            <p className="text-manila text-sm font-medium">{user?.name}</p>
            <p className="text-manila/40 text-xs font-nums">{user?.employee_code}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-sm text-sm font-medium text-manila/60 hover:bg-manila/10 hover:text-manila w-full transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </div>
    </>
  );
}

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const [pendingDisputes, setPendingDisputes] = useState([]);
  const [pendingLeave, setPendingLeave] = useState([]);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pendingCounts = { disputes: pendingDisputes.length, leave: pendingLeave.length };

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      Promise.all([
        api.get("/api/disputes", { params: { status: "pending" } }),
        api.get("/api/leave-requests", { params: { status: "pending" } }),
      ])
        .then(([disputesRes, leaveRes]) => {
          if (cancelled) return;
          setPendingDisputes(disputesRes.data);
          setPendingLeave(leaveRes.data);
        })
        .catch(() => {});
    };
    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  return (
    <div className="min-h-screen flex bg-manila">
      {/* Desktop sidebar — always visible */}
      <aside className="hidden md:flex w-60 bg-ledger-800 flex-col relative flex-shrink-0">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <SidebarContent user={user} logout={logout} pendingCounts={pendingCounts} />
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-30 bg-ledger-800 flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <img src="/jade-logo.png" alt="" className="w-7 h-7" />
          <span className="font-display text-manila text-lg leading-none">JADE HR</span>
        </div>
        <button onClick={() => setMobileOpen(true)} className="text-manila p-1">
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile off-canvas drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div className="absolute inset-0 bg-ledger-900/60" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 bg-ledger-800 flex flex-col">
            <button onClick={() => setMobileOpen(false)} className="absolute top-5 right-4 text-manila/70">
              <X size={20} />
            </button>
            <SidebarContent user={user} logout={logout} pendingCounts={pendingCounts} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <main className="flex-1 p-4 pt-20 md:p-8 md:pt-8 overflow-y-auto overflow-x-hidden max-w-[1400px]">
        <Outlet context={{ pendingDisputes, pendingLeave }} />
      </main>
    </div>
  );
}
