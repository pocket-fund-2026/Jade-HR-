import { Navigate, Route, Routes } from "react-router-dom";

import { AuthProvider, useAuth } from "./lib/auth.jsx";
import Login from "./pages/Login.jsx";
import Setup from "./pages/Setup.jsx";
import AdminLayout from "./pages/admin/AdminLayout.jsx";
import Dashboard from "./pages/admin/Dashboard.jsx";
import EmployeeForm from "./pages/admin/EmployeeForm.jsx";
import Employees from "./pages/admin/Employees.jsx";
import Payroll from "./pages/admin/Payroll.jsx";
import PayrollDetail from "./pages/admin/PayrollDetail.jsx";
import EmployeeLayout from "./pages/employee/EmployeeLayout.jsx";
import MyAttendance from "./pages/employee/MyAttendance.jsx";
import MyPayslip from "./pages/employee/MyPayslip.jsx";

function Protected({ role, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-8 text-gray-500">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) {
    return <Navigate to={user.role === "admin" ? "/admin" : "/employee"} replace />;
  }
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
            <Protected role="admin">
              <AdminLayout />
            </Protected>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="employees" element={<Employees />} />
          <Route path="employees/new" element={<EmployeeForm />} />
          <Route path="employees/:id" element={<EmployeeForm />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="payroll/:id" element={<PayrollDetail />} />
        </Route>

        <Route
          path="/employee"
          element={
            <Protected role="employee">
              <EmployeeLayout />
            </Protected>
          }
        >
          <Route index element={<MyAttendance />} />
          <Route path="payslip" element={<MyPayslip />} />
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}
