import { Calendar, LogOut, Wallet } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

import { useAuth } from "../../lib/auth.jsx";

const navItems = [
  { to: "/employee", label: "My Attendance", icon: Calendar, end: true },
  { to: "/employee/payslip", label: "My Payslip", icon: Wallet },
];

export default function EmployeeLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-jade-700">JADE HR</h1>
            <p className="text-xs text-gray-400">{user?.name}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
        <div className="max-w-4xl mx-auto px-6 flex gap-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 ${
                  isActive
                    ? "border-jade-600 text-jade-700"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`
              }
            >
              <Icon size={16} />
              {label}
            </NavLink>
          ))}
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
