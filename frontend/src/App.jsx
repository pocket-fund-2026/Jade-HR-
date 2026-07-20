import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./lib/auth.jsx";
import Login from "./pages/Login.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Setup from "./pages/Setup.jsx";

// Vite fingerprints each lazy chunk's filename per build. A tab left open
// across a deploy holds stale filenames — the dynamic import() 404s and
// that page just never renders until the user manually refreshes. Retry
// once via a full reload (which re-fetches index.html and the current
// chunk graph) before giving up for real.
const CHUNK_RELOAD_KEY = "jade_hr_chunk_reload";
function lazyWithReload(importer) {
  return lazy(async () => {
    try {
      const mod = await importer();
      sessionStorage.removeItem(CHUNK_RELOAD_KEY);
      return mod;
    } catch (err) {
      if (!sessionStorage.getItem(CHUNK_RELOAD_KEY)) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
        window.location.reload();
        return new Promise(() => {}); // reload takes over before this matters
      }
      throw err;
    }
  });
}

// Route-level code splitting: most logins are the 285 self-service employees,
// who should never have to download the admin console's JS (or vice versa).
const AdminLayout = lazyWithReload(() => import("./pages/admin/AdminLayout.jsx"));
const Dashboard = lazyWithReload(() => import("./pages/admin/Dashboard.jsx"));
const Disputes = lazyWithReload(() => import("./pages/admin/Disputes.jsx"));
const EmployeeDetails = lazyWithReload(() => import("./pages/admin/EmployeeDetails.jsx"));
const Employees = lazyWithReload(() => import("./pages/admin/Employees.jsx"));
const Leave = lazyWithReload(() => import("./pages/admin/Leave.jsx"));
const LeaveEntry = lazyWithReload(() => import("./pages/admin/LeaveEntry.jsx"));
const MyLeave = lazyWithReload(() => import("./pages/admin/MyLeave.jsx"));
const MyPayslip = lazyWithReload(() => import("./pages/admin/MyPayslip.jsx"));
const PayslipApprovals = lazyWithReload(() => import("./pages/admin/PayslipApprovals.jsx"));
const Letters = lazyWithReload(() => import("./pages/admin/Letters.jsx"));
const Payroll = lazyWithReload(() => import("./pages/admin/Payroll.jsx"));
const PayrollDetail = lazyWithReload(() => import("./pages/admin/PayrollDetail.jsx"));
const Policy = lazyWithReload(() => import("./pages/admin/Policy.jsx"));
const Reports = lazyWithReload(() => import("./pages/admin/Reports.jsx"));
const SalarySheetReport = lazyWithReload(() => import("./pages/admin/reports/SalarySheetReport.jsx"));
const YearlySalaryReport = lazyWithReload(() => import("./pages/admin/reports/YearlySalaryReport.jsx"));
const CtcAsPerSalaryReport = lazyWithReload(() => import("./pages/admin/reports/CtcAsPerSalaryReport.jsx"));
const CtcAsPerPayslipReport = lazyWithReload(() => import("./pages/admin/reports/CtcAsPerPayslipReport.jsx"));
const ArrearDetailsReport = lazyWithReload(() => import("./pages/admin/reports/ArrearDetailsReport.jsx"));
const FullAndFinalReport = lazyWithReload(() => import("./pages/admin/reports/FullAndFinalReport.jsx"));
const AccountsJvReport = lazyWithReload(() => import("./pages/admin/reports/AccountsJvReport.jsx"));
const BankTransferReport = lazyWithReload(() => import("./pages/admin/reports/BankTransferReport.jsx"));
const HeadCountReport = lazyWithReload(() => import("./pages/admin/reports/HeadCountReport.jsx"));
const PfReport = lazyWithReload(() => import("./pages/admin/reports/PfReport.jsx"));
const EsicReport = lazyWithReload(() => import("./pages/admin/reports/EsicReport.jsx"));
const PtReport = lazyWithReload(() => import("./pages/admin/reports/PtReport.jsx"));
const LwfReport = lazyWithReload(() => import("./pages/admin/reports/LwfReport.jsx"));
const TdsProjectionReport = lazyWithReload(() => import("./pages/admin/reports/TdsProjectionReport.jsx"));
const BonusReport = lazyWithReload(() => import("./pages/admin/reports/BonusReport.jsx"));
const GratuityReport = lazyWithReload(() => import("./pages/admin/reports/GratuityReport.jsx"));
const LeaveLedgerReport = lazyWithReload(() => import("./pages/admin/reports/LeaveLedgerReport.jsx"));
const LumpsumReport = lazyWithReload(() => import("./pages/admin/reports/LumpsumReport.jsx"));
const AttendanceReport = lazyWithReload(() => import("./pages/admin/reports/AttendanceReport.jsx"));
const TeamAccess = lazyWithReload(() => import("./pages/admin/TeamAccess.jsx"));
const OnboardingReview = lazyWithReload(() => import("./pages/admin/Onboarding.jsx"));
const WorkAbsence = lazyWithReload(() => import("./pages/admin/WorkAbsence.jsx"));
const EmployeeLayout = lazyWithReload(() => import("./pages/employee/EmployeeLayout.jsx"));
const EmployeeDashboard = lazyWithReload(() => import("./pages/employee/Dashboard.jsx"));
const TeamLeave = lazyWithReload(() => import("./pages/employee/TeamLeave.jsx"));
const TaxDeclaration = lazyWithReload(() => import("./pages/employee/TaxDeclaration.jsx"));

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
  const { user, can, permissionsLoading } = useAuth();
  // hr's permissions arrive one round-trip after `user` — on a direct
  // nav/hard-refresh into a gated route, deciding before they land would
  // read the still-empty permission set as "denied" and bounce a user who
  // actually has access. accounts doesn't need this (can() short-circuits
  // true for that role without ever consulting `permissions`).
  if (user?.role === "hr" && permissionsLoading) return <PageFallback />;
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
          <Route path="/onboarding/new" element={<Onboarding />} />

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
            <Route path="reports" element={<RequirePermission anyOf={["payroll.view"]}><Reports /></RequirePermission>} />
            <Route path="reports/salary-sheet" element={<RequirePermission anyOf={["payroll.view"]}><SalarySheetReport /></RequirePermission>} />
            <Route path="reports/yearly-salary" element={<RequirePermission anyOf={["payroll.view"]}><YearlySalaryReport /></RequirePermission>} />
            <Route path="reports/ctc-as-per-salary" element={<RequirePermission anyOf={["payroll.view"]}><CtcAsPerSalaryReport /></RequirePermission>} />
            <Route path="reports/ctc-as-per-payslip" element={<RequirePermission anyOf={["payroll.view"]}><CtcAsPerPayslipReport /></RequirePermission>} />
            <Route path="reports/arrears" element={<RequirePermission anyOf={["payroll.view"]}><ArrearDetailsReport /></RequirePermission>} />
            <Route path="reports/full-and-final" element={<RequirePermission anyOf={["payroll.view"]}><FullAndFinalReport /></RequirePermission>} />
            <Route path="reports/accounts-jv" element={<RequirePermission anyOf={["payroll.view"]}><AccountsJvReport /></RequirePermission>} />
            <Route path="reports/bank-transfer" element={<RequirePermission anyOf={["payroll.view"]}><BankTransferReport /></RequirePermission>} />
            <Route path="reports/head-count" element={<RequirePermission anyOf={["payroll.view", "employees.view"]}><HeadCountReport /></RequirePermission>} />
            <Route path="reports/pf" element={<RequirePermission anyOf={["payroll.view"]}><PfReport /></RequirePermission>} />
            <Route path="reports/esic" element={<RequirePermission anyOf={["payroll.view"]}><EsicReport /></RequirePermission>} />
            <Route path="reports/pt" element={<RequirePermission anyOf={["payroll.view"]}><PtReport /></RequirePermission>} />
            <Route path="reports/lwf" element={<RequirePermission anyOf={["payroll.view"]}><LwfReport /></RequirePermission>} />
            <Route path="reports/tds-projection" element={<RequirePermission anyOf={["payroll.view"]}><TdsProjectionReport /></RequirePermission>} />
            <Route path="reports/bonus" element={<RequirePermission anyOf={["payroll.view"]}><BonusReport /></RequirePermission>} />
            <Route path="reports/gratuity" element={<RequirePermission anyOf={["payroll.view"]}><GratuityReport /></RequirePermission>} />
            <Route path="reports/leave-ledger" element={<RequirePermission anyOf={["leave.manage", "payroll.view"]}><LeaveLedgerReport /></RequirePermission>} />
            <Route path="reports/lumpsum" element={<RequirePermission anyOf={["payroll.view"]}><LumpsumReport /></RequirePermission>} />
            <Route path="reports/attendance" element={<RequirePermission anyOf={["payroll.view", "attendance.view"]}><AttendanceReport /></RequirePermission>} />
            <Route path="disputes" element={<RequirePermission anyOf={["disputes.manage"]}><Disputes /></RequirePermission>} />
            <Route path="leave" element={<RequirePermission anyOf={["leave.manage"]}><Leave /></RequirePermission>} />
            <Route path="work-absence" element={<RequirePermission anyOf={["absence.manage"]}><WorkAbsence /></RequirePermission>} />
            <Route path="leave-entry" element={<RequirePermission anyOf={["leave.manage"]}><LeaveEntry /></RequirePermission>} />
            <Route path="my-leave" element={<MyLeave />} />
            <Route path="my-payslip" element={<MyPayslip />} />
            <Route path="payslip-approvals" element={<RequirePermission anyOf={["payslip_approvals.manage"]}><PayslipApprovals /></RequirePermission>} />
            <Route path="letters" element={<RequirePermission anyOf={["letters.generate", "letters.manage"]}><Letters /></RequirePermission>} />
            <Route path="policy" element={<RequirePermission anyOf={["employees.manage", "policy.manage"]}><Policy /></RequirePermission>} />
            <Route path="team-access" element={<RequirePermission anyOf={["permissions.manage"]}><TeamAccess /></RequirePermission>} />
            <Route path="onboarding" element={<RequirePermission anyOf={["onboarding.manage"]}><OnboardingReview /></RequirePermission>} />
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
            <Route path="tax-declaration" element={<TaxDeclaration />} />
            <Route path="*" element={<Navigate to="/employee" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </AuthProvider>
  );
}
