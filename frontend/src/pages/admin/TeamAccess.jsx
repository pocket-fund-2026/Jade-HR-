import { Lock, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

function RoleDefaults({ rows, loading, savingKey, onToggle }) {
  return (
    <div>
      <p className="text-sm text-ink/70 mb-4">
        Defaults for every HR login. Accounts always has full access regardless of these toggles.
      </p>
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
                onChange={(next) => onToggle(r.permission_key, next)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function PersonOverrides({ permissionKeys, hrEmployees, overrides, onApplyBulk, onRemove, applying }) {
  const [selectedKey, setSelectedKey] = useState(permissionKeys[0]?.permission_key || "");
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    if (!selectedKey && permissionKeys.length) setSelectedKey(permissionKeys[0].permission_key);
  }, [permissionKeys]);

  const toggleSelected = (id) =>
    setSelectedIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));

  const labelFor = (key) => permissionKeys.find((p) => p.permission_key === key)?.label || key;

  return (
    <div>
      <p className="text-sm text-ink/70 mb-4">
        Grant or deny one specific capability for specific HR logins — e.g. let two named people see salary
        figures without turning that on for the whole HR team.
      </p>

      <div className="bg-paper rounded-sm shadow-card p-5 mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-3">Apply to selected people</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label htmlFor="override_permission" className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Permission</label>
            <select
              id="override_permission"
              className="w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
            >
              {permissionKeys.map((p) => (
                <option key={p.permission_key} value={p.permission_key}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-2">HR logins</p>
        <div className="max-h-48 overflow-y-auto border border-ink/10 rounded-sm mb-4">
          {hrEmployees.length === 0 ? (
            <p className="px-3 py-4 text-sm text-ink/40">No HR-role employees yet.</p>
          ) : (
            hrEmployees.map((e) => (
              <label key={e.id} className="flex items-center gap-2.5 px-3 py-2 border-b border-ink/[0.06] last:border-0 cursor-pointer hover:bg-manila/30">
                <input
                  type="checkbox"
                  checked={selectedIds.includes(e.id)}
                  onChange={() => toggleSelected(e.id)}
                  className="w-4 h-4 accent-jade-600"
                />
                <span className="text-sm text-ink">{e.name}</span>
                <span className="text-xs text-ink/40 font-nums">{e.employee_code}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            disabled={applying || !selectedIds.length}
            onClick={() => onApplyBulk(selectedKey, true, selectedIds)}
            className="bg-jade-600 text-white px-4 py-2 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors"
          >
            Grant to selected
          </button>
          <button
            type="button"
            disabled={applying || !selectedIds.length}
            onClick={() => onApplyBulk(selectedKey, false, selectedIds)}
            className="bg-paper border border-rust-500 text-rust-500 px-4 py-2 rounded-sm text-sm font-semibold hover:bg-rust-50 disabled:opacity-50 transition-colors"
          >
            Deny for selected
          </button>
        </div>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-3">Current overrides</p>
      {overrides.length === 0 ? (
        <p className="text-sm text-ink/40">No per-person overrides set.</p>
      ) : (
        <div className="bg-paper rounded-sm shadow-card divide-y divide-ink/[0.06]">
          {overrides.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div>
                <p className="text-sm text-ink font-medium">
                  {o.hr_employees?.first_name} {o.hr_employees?.last_name}
                  <span className="text-xs text-ink/40 font-nums ml-2">{o.hr_employees?.employee_code}</span>
                </p>
                <p className="text-xs text-ink/70 mt-0.5">
                  {labelFor(o.permission_key)} — {o.granted ? "Granted" : "Denied"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onRemove(o.employee_id, o.permission_key)}
                aria-label="Remove override"
                className="text-ink/40 hover:text-rust-500 p-1"
              >
                <X size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TeamAccess() {
  const { user } = useAuth();
  const isAccounts = user?.role === "accounts";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState(null);
  const [error, setError] = useState("");

  const [hrEmployees, setHrEmployees] = useState([]);
  const [overrides, setOverrides] = useState([]);
  const [applying, setApplying] = useState(false);

  const load = () => {
    setLoading(true);
    api.get("/api/permissions").then(({ data }) => setRows(data)).finally(() => setLoading(false));
  };

  const loadOverrides = () => {
    api.get("/api/permissions/overrides").then(({ data }) => setOverrides(data));
  };

  const loadHrEmployees = () => {
    api.get("/api/employees").then(({ data }) => {
      setHrEmployees(
        data
          .filter((e) => e.role === "hr" && e.is_active)
          .map((e) => ({ id: e.id, employee_code: e.employee_code, name: `${e.first_name} ${e.last_name || ""}`.trim() }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
    });
  };

  useEffect(() => {
    load();
    loadOverrides();
    loadHrEmployees();
  }, []);

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

  const applyBulk = async (permission_key, granted, employee_ids) => {
    setError("");
    setApplying(true);
    try {
      await api.post("/api/permissions/overrides/bulk", { permission_key, granted, employee_ids });
      loadOverrides();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not save — try again");
    } finally {
      setApplying(false);
    }
  };

  const removeOverride = async (employee_id, permission_key) => {
    setError("");
    try {
      await api.delete(`/api/permissions/overrides/${employee_id}/${permission_key}`);
      loadOverrides();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not remove — try again");
    }
  };

  const permissionKeys = useMemo(() => rows.map((r) => ({ permission_key: r.permission_key, label: r.label })), [rows]);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck size={20} className="text-jade-600" />
        <h2 className="font-display text-2xl text-ink">Team Access</h2>
      </div>
      <p className="text-sm text-ink/70 mb-6">
        Control what the HR role can see and do in the admin console. Accounts ({user?.name}) always has full
        access.
      </p>

      {error && <p className="text-sm text-rust-500 mb-4 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}

      {isAccounts && (
        <div className="mb-8">
          <RoleDefaults rows={rows} loading={loading} savingKey={savingKey} onToggle={toggle} />
        </div>
      )}

      <PersonOverrides
        permissionKeys={permissionKeys}
        hrEmployees={hrEmployees}
        overrides={overrides}
        onApplyBulk={applyBulk}
        onRemove={removeOverride}
        applying={applying}
      />

      <div className="flex items-start gap-2 mt-5 text-xs text-ink/70">
        <Lock size={13} className="mt-0.5 flex-shrink-0" />
        <p>
          Only Accounts can change the role-wide defaults above, and only Accounts can promote someone into the
          HR or Accounts role.
        </p>
      </div>
    </div>
  );
}
