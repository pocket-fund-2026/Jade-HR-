import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import api from "../../lib/api.js";

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
  phone: "",
  email: "",
  role: "employee",
  password: "",
};

export default function EmployeeForm() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
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
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500"
        value={form[key]}
        onChange={set(key)}
        {...extra}
      />
    </div>
  );

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">{isEdit ? "Edit Employee" : "Add Employee"}</h2>

      <form onSubmit={submit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
        <div className="grid grid-cols-2 gap-4">
          {field("Employee Code (biometric ID)", "employee_code", "text", isEdit ? { disabled: true } : { required: true })}
          {field("Role", "role")}
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

        <div className="border-t border-gray-100 pt-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Salary Structure (used for OT calc)</p>
          <div className="grid grid-cols-3 gap-4">
            {field("Basic", "basic", "number")}
            {field("HRA", "hra", "number")}
            {field("Conveyance", "conveyance", "number")}
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            {field("Other Allowance", "other_allowance", "number")}
            {field("Standard Hours / Day", "standard_hours_per_day", "number", { step: "0.5" })}
          </div>
        </div>

        <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-4">
          {field("Phone", "phone")}
          {field("Email", "email")}
        </div>

        <div className="border-t border-gray-100 pt-4">
          {field(isEdit ? "Reset Password (leave blank to keep)" : "Password", "password", "password", isEdit ? {} : { required: true })}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex items-center justify-between pt-2">
          <div>
            {isEdit && (
              <button type="button" onClick={deactivate} className="text-sm text-red-600 hover:underline">
                Deactivate employee
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={busy}
            className="bg-jade-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-jade-700 disabled:opacity-50"
          >
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
