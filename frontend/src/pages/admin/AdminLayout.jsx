import { Flag, LayoutDashboard, LogOut, Receipt, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/employees", label: "Employees", icon: Users },
  { to: "/admin/payroll", label: "Payroll & OT", icon: Receipt },
  { to: "/admin/disputes", label: "Disputes", icon: Flag },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    api.get("/api/disputes", { params: { status: "pending" } }).then(({ data }) => setPendingCount(data.length)).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen flex bg-manila">
      <aside className="w-60 bg-ledger-800 flex flex-col relative">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="px-6 py-6 relative">
          <p className="font-display text-manila text-xl leading-none">JADE HR</p>
          <p className="text-manila/40 text-[11px] uppercase tracking-[0.2em] mt-1.5">Admin Ledger</p>
        </div>
        <nav className="flex-1 px-3 py-2 space-y-1 relative">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
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
              {label === "Disputes" && pendingCount > 0 && (
                <span className="ml-auto bg-ochre-500 text-ledger-900 text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingCount}
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
      </aside>
      <main className="flex-1 p-8 overflow-y-auto max-w-[1400px]">
        <Outlet />
      </main>
    </div>
  );
}
