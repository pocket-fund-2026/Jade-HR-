import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

const ROLE_LABELS = { employee: "Employee", hr: "HR", accounts: "Accounts" };

const empty = {
  employee_code: "",
  first_name: "",
  last_name: "",
  designation: "",
  department: "",
  location: "Madhu Estate, Mumbai",
  date_of_joining: "",
  basic: 0,
  hra: 0,
  conveyance: 0,
  other_allowance: 0,
  standard_hours_per_day: 8,
  weekly_off_day: 6,
  phone: "",
  email: "",
  role: "employee",
  password: "",
};

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function EmployeeForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { user, can } = useAuth();
  const canViewSalary = can("salary.view", "salary.edit");
  const canEditSalary = can("salary.edit");
  const canAssignRole = user?.role === "accounts";
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isEdit) return;
    api.get(`/api/employees/${id}`).then(({ data }) => {
      setForm({ ...empty, ...data, date_of_joining: data.date_of_joining || "", password: "" });
    });
  }, [id]);

  const set = (key) => (e) => {
    const val = e.target.type === "number" ? Number(e.target.value) : e.target.value;
    setForm((f) => ({ ...f, [key]: val }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (isEdit) {
        const { employee_code, ...updates } = form;
        if (!updates.password) delete updates.password;
        await api.put(`/api/employees/${id}`, updates);
      } else {
        await api.post("/api/employees", form);
      }
      navigate("/admin/employees");
    } catch (err) {
      setError(err.response?.data?.detail || "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    if (!confirm("Deactivate this employee? Their attendance/payroll history is kept.")) return;
    await api.delete(`/api/employees/${id}`);
    navigate("/admin/employees");
  };

  const field = (label, key, type = "text", extra = {}) => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-ink/50 mb-1.5">{label}</label>
      <input
        type={type}
        className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500 disabled:opacity-50 disabled:bg-ink/5"
        value={form[key]}
        onChange={set(key)}
        {...extra}
      />
    </div>
  );

  return (
    <div className="max-w-2xl">
      <Link to="/admin/employees" className="inline-flex items-center gap-1.5 text-xs text-ink/45 hover:text-ink mb-3 transition-colors">
        <ArrowLeft size={13} /> Back to Employees
      </Link>
      <h2 className="font-display text-2xl text-ink mb-6">{isEdit ? "Edit Employee" : "Add Employee"}</h2>

      <form onSubmit={submit} className="bg-paper rounded-sm shadow-card p-7 space-y-7 border-t-4 border-jade-500">
        <div className="grid grid-cols-2 gap-4">
          {field("Employee Code (biometric ID)", "employee_code", "text", isEdit ? { disabled: true } : { required: true })}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/50 mb-1.5">Role</label>
            <select
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 disabled:opacity-50 disabled:bg-ink/5"
              value={form.role}
              disabled={!canAssignRole}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
            >
              {canAssignRole
                ? Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))
                : <option value={form.role}>{ROLE_LABELS[form.role] || form.role}</option>}
            </select>
            {!canAssignRole && (
              <p className="text-xs text-ink/40 mt-1">Only Accounts can change HR/Accounts console roles.</p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field("First Name", "first_name", "text", { required: true })}
          {field("Last Name", "last_name")}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field("Designation", "designation")}
          {field("Department", "department")}
        </div>
        <div className="grid grid-cols-2 gap-4">
          {field("Location", "location")}
          {field("Date of Joining", "date_of_joining", "date")}
        </div>

        {canViewSalary ? (
          <div className="border-t border-ink/10 pt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-ochre-600 mb-4">Salary structure — used for OT calc</p>
            <div className="grid grid-cols-3 gap-4">
              {field("Basic", "basic", "number", { disabled: !canEditSalary })}
              {field("HRA", "hra", "number", { disabled: !canEditSalary })}
              {field("Conveyance", "conveyance", "number", { disabled: !canEditSalary })}
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              {field("Other Allowance", "other_allowance", "number", { disabled: !canEditSalary })}
              {field("Standard Hours / Day", "standard_hours_per_day", "number", { step: "0.5", disabled: !canEditSalary })}
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/50 mb-1.5">Weekly Off Day</label>
                <select
                  className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 disabled:opacity-50 disabled:bg-ink/5"
                  value={form.weekly_off_day}
                  disabled={!canEditSalary}
                  onChange={(e) => setForm((f) => ({ ...f, weekly_off_day: Number(e.target.value) }))}
                >
                  {DAY_NAMES.map((name, i) => (
                    <option key={i} value={i}>{name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="border-t border-ink/10 pt-6">
            <p className="text-xs text-ink/40">Salary structure is managed by Accounts.</p>
          </div>
        )}

        <div className="border-t border-ink/10 pt-6 grid grid-cols-2 gap-4">
          {field("Phone", "phone")}
          {field("Email", "email")}
        </div>

        <div className="border-t border-ink/10 pt-6">
          {field(isEdit ? "Reset Password (leave blank to keep)" : "Password", "password", "password", isEdit ? {} : { required: true })}
        </div>

        {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          <div>
            {isEdit && (
              <button type="button" onClick={deactivate} className="text-sm text-rust-500 hover:text-rust-600 hover:underline">
                Deactivate employee
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="bg-ledger-800 text-manila px-6 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
          >
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
