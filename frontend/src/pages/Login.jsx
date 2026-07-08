import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../lib/auth.jsx";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [employeeCode, setEmployeeCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const role = await login(employeeCode, password);
      navigate(role === "admin" ? "/admin" : "/employee");
    } catch (err) {
      setError(err.response?.data?.detail || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-jade-700">JADE HR</h1>
          <p className="text-sm text-gray-500 mt-1">Madhu Estate, Mumbai</p>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee Code</label>
            <input
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jade-500"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <input
              type="password"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-jade-500"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-jade-600 text-white py-2 font-medium hover:bg-jade-700 disabled:opacity-50"
          >
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="text-center text-xs text-gray-400 mt-6">
          First time setting up? <Link to="/setup" className="text-jade-700 hover:underline">Create admin account</Link>
        </p>
      </div>
    </div>
  );
}
