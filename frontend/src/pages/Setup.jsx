import { useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../lib/api.js";

export default function Setup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ employee_code: "", first_name: "", last_name: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api.post("/api/auth/bootstrap-admin", form);
      localStorage.setItem("jade_hr_token", data.access_token);
      localStorage.setItem("jade_hr_role", data.role);
      navigate("/admin");
      window.location.reload();
    } catch (err) {
      setError(err.response?.data?.detail || "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-jade-700">JADE HR — First-time Setup</h1>
          <p className="text-sm text-gray-500 mt-1">Create the first admin account</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Admin Employee Code</label>
            <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.employee_code} onChange={set("employee_code")} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
            <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.first_name} onChange={set("first_name")} required />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
            <input className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.last_name} onChange={set("last_name")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input type="password" className="w-full rounded-lg border border-gray-300 px-3 py-2" value={form.password} onChange={set("password")} required />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button type="submit" disabled={busy} className="w-full rounded-lg bg-jade-600 text-white py-2 font-medium hover:bg-jade-700 disabled:opacity-50">
            {busy ? "Creating..." : "Create Admin Account"}
          </button>
        </form>
      </div>
    </div>
  );
}
