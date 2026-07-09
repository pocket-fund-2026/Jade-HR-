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

  const field = (label, key, opts = {}) => (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-ink/50 mb-1.5">{label}</label>
      <input
        className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 font-nums text-ink focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500"
        value={form[key]}
        onChange={set(key)}
        {...opts}
      />
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center bg-ledger-900 px-4 py-12 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-ledger-weave" />
      <div className="w-full max-w-sm relative">
        <div className="text-center mb-8">
          <p className="font-display text-manila text-2xl">First-time setup</p>
          <p className="text-manila/50 text-sm mt-1">Open a new ledger — create the first admin account</p>
        </div>

        <div className="bg-paper rounded-sm shadow-stamp px-8 pt-8 pb-7 border-t-4 border-ochre-500 rise-in">
          <form onSubmit={submit} className="space-y-5">
            {field("Admin Employee Code", "employee_code", { required: true })}
            <div className="grid grid-cols-2 gap-4">
              {field("First Name", "first_name", { required: true })}
              {field("Last Name", "last_name")}
            </div>
            {field("Password", "password", { type: "password", required: true })}

            {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-sm bg-ledger-800 text-manila py-2.5 font-semibold tracking-wide hover:bg-ledger-700 disabled:opacity-50 transition-colors"
            >
              {busy ? "Creating…" : "Create admin account"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
