import { LogOut } from "lucide-react";
import { Outlet } from "react-router-dom";

import { useAuth } from "../../lib/auth.jsx";

export default function EmployeeLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-manila">
      <header className="bg-ledger-800 relative">
        <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between relative">
          <div>
            <p className="font-display text-manila text-lg leading-none">JADE HR</p>
            <p className="text-manila/40 text-xs mt-1">{user?.name}</p>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-manila/60 hover:text-manila transition-colors"
          >
            <LogOut size={16} />
            Sign out
          </button>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
