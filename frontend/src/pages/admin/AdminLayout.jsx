import { LayoutDashboard, LogOut, Receipt, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../../lib/auth.jsx";

const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/admin/employees", label: "Employees", icon: Users },
  { to: "/admin/payroll", label: "Payroll & OT", icon: Receipt },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-60 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-6 py-5 border-b border-gray-200">
          <h1 className="text-lg font-semibold text-jade-700">JADE HR</h1>
          <p className="text-xs text-gray-400">Admin</p>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium ${
                  isActive ? "bg-jade-50 text-jade-700" : "text-gray-600 hover:bg-gray-100"
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-gray-200">
          <div className="px-3 py-2 text-sm text-gray-500">{user?.name}</div>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 w-full"
          >
            <LogOut size={18} />
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
