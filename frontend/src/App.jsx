import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./lib/auth.jsx";
import Login from "./pages/Login.jsx";
import Setup from "./pages/Setup.jsx";

// Route-level code splitting: most logins are the 285 self-service employees,
// who should never have to download the admin console's JS (or vice versa).
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.jsx"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard.jsx"));
const Disputes = lazy(() => import("./pages/admin/Disputes.jsx"));
const EmployeeDetails = lazy(() => import("./pages/admin/EmployeeDetails.jsx"));
const Employees = lazy(() => import("./pages/admin/Employees.jsx"));
const Leave = lazy(() => import("./pages/admin/Leave.jsx"));
const Payroll = lazy(() => import("./pages/admin/Payroll.jsx"));
const PayrollDetail = lazy(() => import("./pages/admin/PayrollDetail.jsx"));
const Policy = lazy(() => import("./pages/admin/Policy.jsx"));
const TeamAccess = lazy(() => import("./pages/admin/TeamAccess.jsx"));
const EmployeeLayout = lazy(() => import("./pages/employee/EmployeeLayout.jsx"));
const EmployeeDashboard = lazy(() => import("./pages/employee/Dashboard.jsx"));
const TeamLeave = lazy(() => import("./pages/employee/TeamLeave.jsx"));

const CONSOLE_ROLES = ["accounts", "hr"];

function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-manila">
      <p className="font-display text-ink/70 text-lg">Opening the ledger…</p>
    </div>
  );
}

function Protected({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <PageFallback />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={CONSOLE_ROLES.includes(user.role) ? "/admin" : "/employee"} replace />;
  }
  return children;
}

// Gates a section behind an hr_permissions key — accounts always passes.
// Used for whole pages (Payroll, Disputes, Leave) and Team Access, which is
// accounts by default but can be delegated via the permissions.manage key.
function RequirePermission({ anyOf, children }) {
  const { can } = useAuth();
  if (!can(...anyOf)) return <Navigate to="/admin" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<PageFallback />}>
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
            <Route path="employees/new" element={<RequirePermission anyOf={["employees.manage"]}><EmployeeDetails /></RequirePermission>} />
            <Route path="employees/:id" element={<RequirePermission anyOf={["employees.view"]}><EmployeeDetails /></RequirePermission>} />
            <Route path="payroll" element={<RequirePermission anyOf={["payroll.view"]}><Payroll /></RequirePermission>} />
            <Route path="payroll/:id" element={<RequirePermission anyOf={["payroll.view"]}><PayrollDetail /></RequirePermission>} />
            <Route path="disputes" element={<RequirePermission anyOf={["disputes.manage"]}><Disputes /></RequirePermission>} />
            <Route path="leave" element={<RequirePermission anyOf={["leave.manage"]}><Leave /></RequirePermission>} />
            <Route path="policy" element={<RequirePermission anyOf={["employees.manage", "policy.manage"]}><Policy /></RequirePermission>} />
            <Route path="team-access" element={<RequirePermission anyOf={["permissions.manage"]}><TeamAccess /></RequirePermission>} />
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
            <Route path="team-leave" element={<TeamLeave />} />
            <Route path="*" element={<Navigate to="/employee" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
