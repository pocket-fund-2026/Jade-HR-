import { Lock, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative w-11 h-6 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
        checked ? "bg-jade-500" : "bg-ink/20"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-paper shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function TeamAccess() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    api.get("/api/permissions").then(({ data }) => setRows(data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggle = async (permission_key, hr_can_access) => {
    setError("");
    setSavingKey(permission_key);
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.permission_key === permission_key ? { ...r, hr_can_access } : r)));
    try {
      await api.put(`/api/permissions/${permission_key}`, { hr_can_access });
    } catch (err) {
      setRows(prev);
      setError(err.response?.data?.detail || "Could not save — try again");
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={20} className="text-jade-600" />
        <h2 className="font-display text-2xl text-ink">Team Access</h2>
      </div>
      <p className="text-sm text-ink/70 mb-6">
        Control what the HR role can see and do in the admin console. Accounts ({user?.name}) always has full
        access — these toggles only affect HR logins.
      </p>

      {error && <p className="text-sm text-rust-500 mb-4 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}

      <div className="bg-paper rounded-sm shadow-card divide-y divide-ink/[0.06]">
        {loading ? (
          <p className="px-5 py-8 text-ink/70 text-center text-sm">Loading permissions…</p>
        ) : (
          rows.map((r) => (
            <div key={r.permission_key} className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-sm text-ink font-medium">{r.label}</p>
                <p className="text-xs text-ink/70 font-nums mt-0.5">{r.permission_key}</p>
              </div>
              <Toggle
                checked={r.hr_can_access}
                disabled={savingKey === r.permission_key}
                onChange={(next) => toggle(r.permission_key, next)}
              />
            </div>
          ))
        )}
      </div>

      <div className="flex items-start gap-2 mt-5 text-xs text-ink/70">
        <Lock size={13} className="mt-0.5 flex-shrink-0" />
        <p>
          Only Accounts can view or change this page, and only Accounts can promote someone into the HR or
          Accounts role.
        </p>
      </div>
    </div>
  );
}
