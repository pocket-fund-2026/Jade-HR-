import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./lib/auth.jsx";
import Login from "./pages/Login.jsx";
import Onboarding from "./pages/Onboarding.jsx";
import Setup from "./pages/Setup.jsx";

// Route-level code splitting: most logins are the 285 self-service employees,
// who should never have to download the admin console's JS (or vice versa).
const AdminLayout = lazy(() => import("./pages/admin/AdminLayout.jsx"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard.jsx"));
const Disputes = lazy(() => import("./pages/admin/Disputes.jsx"));
const EmployeeDetails = lazy(() => import("./pages/admin/EmployeeDetails.jsx"));
const Employees = lazy(() => import("./pages/admin/Employees.jsx"));
const Leave = lazy(() => import("./pages/admin/Leave.jsx"));
const LeaveEntry = lazy(() => import("./pages/admin/LeaveEntry.jsx"));
const MyLeave = lazy(() => import("./pages/admin/MyLeave.jsx"));
const MyPayslip = lazy(() => import("./pages/admin/MyPayslip.jsx"));
const PayslipApprovals = lazy(() => import("./pages/admin/PayslipApprovals.jsx"));
const Letters = lazy(() => import("./pages/admin/Letters.jsx"));
const Payroll = lazy(() => import("./pages/admin/Payroll.jsx"));
const PayrollDetail = lazy(() => import("./pages/admin/PayrollDetail.jsx"));
const Policy = lazy(() => import("./pages/admin/Policy.jsx"));
const Reports = lazy(() => import("./pages/admin/Reports.jsx"));
const SalarySheetReport = lazy(() => import("./pages/admin/reports/SalarySheetReport.jsx"));
const YearlySalaryReport = lazy(() => import("./pages/admin/reports/YearlySalaryReport.jsx"));
const CtcAsPerSalaryReport = lazy(() => import("./pages/admin/reports/CtcAsPerSalaryReport.jsx"));
const CtcAsPerPayslipReport = lazy(() => import("./pages/admin/reports/CtcAsPerPayslipReport.jsx"));
const ArrearDetailsReport = lazy(() => import("./pages/admin/reports/ArrearDetailsReport.jsx"));
const FullAndFinalReport = lazy(() => import("./pages/admin/reports/FullAndFinalReport.jsx"));
const AccountsJvReport = lazy(() => import("./pages/admin/reports/AccountsJvReport.jsx"));
const BankTransferReport = lazy(() => import("./pages/admin/reports/BankTransferReport.jsx"));
const HeadCountReport = lazy(() => import("./pages/admin/reports/HeadCountReport.jsx"));
const PfReport = lazy(() => import("./pages/admin/reports/PfReport.jsx"));
const EsicReport = lazy(() => import("./pages/admin/reports/EsicReport.jsx"));
const PtReport = lazy(() => import("./pages/admin/reports/PtReport.jsx"));
const LwfReport = lazy(() => import("./pages/admin/reports/LwfReport.jsx"));
const TdsProjectionReport = lazy(() => import("./pages/admin/reports/TdsProjectionReport.jsx"));
const BonusReport = lazy(() => import("./pages/admin/reports/BonusReport.jsx"));
const GratuityReport = lazy(() => import("./pages/admin/reports/GratuityReport.jsx"));
const LeaveLedgerReport = lazy(() => import("./pages/admin/reports/LeaveLedgerReport.jsx"));
const LumpsumReport = lazy(() => import("./pages/admin/reports/LumpsumReport.jsx"));
const AttendanceReport = lazy(() => import("./pages/admin/reports/AttendanceReport.jsx"));
const TeamAccess = lazy(() => import("./pages/admin/TeamAccess.jsx"));
const OnboardingReview = lazy(() => import("./pages/admin/Onboarding.jsx"));
const WorkAbsence = lazy(() => import("./pages/admin/WorkAbsence.jsx"));
const EmployeeLayout = lazy(() => import("./pages/employee/EmployeeLayout.jsx"));
const EmployeeDashboard = lazy(() => import("./pages/employee/Dashboard.jsx"));
const TeamLeave = lazy(() => import("./pages/employee/TeamLeave.jsx"));
const TaxDeclaration = lazy(() => import("./pages/employee/TaxDeclaration.jsx"));

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
            <Route path="reports/attendance" element={<RequirePermission anyOf={["payroll.view"]}><AttendanceReport /></RequirePermission>} />
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
