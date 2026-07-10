import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./lib/auth.jsx";
import Login from "./pages/Login.jsx";
import Setup from "./pages/Setup.jsx";
import AdminLayout from "./pages/admin/AdminLayout.jsx";
import Dashboard from "./pages/admin/Dashboard.jsx";
import Disputes from "./pages/admin/Disputes.jsx";
import EmployeeForm from "./pages/admin/EmployeeForm.jsx";
import Employees from "./pages/admin/Employees.jsx";
import Leave from "./pages/admin/Leave.jsx";
import Payroll from "./pages/admin/Payroll.jsx";
import PayrollDetail from "./pages/admin/PayrollDetail.jsx";
import TeamAccess from "./pages/admin/TeamAccess.jsx";
import EmployeeLayout from "./pages/employee/EmployeeLayout.jsx";
import EmployeeDashboard from "./pages/employee/Dashboard.jsx";

const CONSOLE_ROLES = ["accounts", "hr"];

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-manila">
        <p className="font-display text-ink/40 text-lg">Opening the ledger…</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={CONSOLE_ROLES.includes(user.role) ? "/admin" : "/employee"} replace />;
  }
  return children;
}

// Gates a section behind an hr_permissions key — accounts always passes.
// Used both for whole pages (Payroll, Disputes, Leave) and the accounts-only
// Team Access settings page.
function RequirePermission({ anyOf, children }) {
  const { can } = useAuth();
  if (!can(...anyOf)) return <Navigate to="/admin" replace />;
  return children;
}

function RequireAccounts({ children }) {
  const { user } = useAuth();
  if (user?.role !== "accounts") return <Navigate to="/admin" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/setup" element={<Setup />} />

        <Route
          path="/admin"
          element={
            <Protected roles={CONSOLE_ROLES}>
              <AdminLayout />
            </Protected>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="employees" element={<RequirePermission anyOf={["employees.view"]}><Employees /></RequirePermission>} />
          <Route path="employees/new" element={<RequirePermission anyOf={["employees.manage"]}><EmployeeForm /></RequirePermission>} />
          <Route path="employees/:id" element={<RequirePermission anyOf={["employees.view"]}><EmployeeForm /></RequirePermission>} />
          <Route path="payroll" element={<RequirePermission anyOf={["payroll.view"]}><Payroll /></RequirePermission>} />
          <Route path="payroll/:id" element={<RequirePermission anyOf={["payroll.view"]}><PayrollDetail /></RequirePermission>} />
          <Route path="disputes" element={<RequirePermission anyOf={["disputes.manage"]}><Disputes /></RequirePermission>} />
          <Route path="leave" element={<RequirePermission anyOf={["leave.manage"]}><Leave /></RequirePermission>} />
          <Route path="team-access" element={<RequireAccounts><TeamAccess /></RequireAccounts>} />
        </Route>

        <Route
          path="/employee"
          element={
            <Protected roles={["employee"]}>
              <EmployeeLayout />
            </Protected>
          }
        >
          <Route index element={<EmployeeDashboard />} />
          <Route path="*" element={<Navigate to="/employee" replace />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
