import { createContext, useContext, useEffect, useState } from "react";

import api from "./api";

const AuthContext = createContext(null);
const CONSOLE_ROLES = ["accounts", "hr"];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  // Starts true so RequirePermission (App.jsx) can tell "hr role, permission
  // not loaded yet" apart from "hr role, permission checked and denied" —
  // without this, a direct nav/hard-refresh onto a gated route reads the
  // still-empty `permissions` object as denied and bounces to /admin before
  // the fetch below resolves, even for a permission the caller actually has.
  const [permissionsLoading, setPermissionsLoading] = useState(true);

  const loadPermissions = async () => {
    setPermissionsLoading(true);
    try {
      const { data } = await api.get("/api/permissions/me");
      setPermissions(data);
    } catch {
      setPermissions({});
    } finally {
      setPermissionsLoading(false);
    }
  };

  const loadMe = async () => {
    const token = localStorage.getItem("jade_hr_token");
    if (!token) {
      setLoading(false);
      setPermissionsLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/api/auth/me");
      setUser(data);
      // Don't block first render on this — nav items gated by a permission
      // just default to hidden for the instant it takes to arrive, then
      // pop in. Saves a full extra network round-trip before anything paints.
      if (CONSOLE_ROLES.includes(data.role)) loadPermissions();
      else setPermissionsLoading(false);
    } catch {
      localStorage.removeItem("jade_hr_token");
      setPermissionsLoading(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMe();
  }, []);

  const login = async (employee_code, password) => {
    const { data } = await api.post("/api/auth/login", { employee_code, password });
    localStorage.setItem("jade_hr_token", data.access_token);
    localStorage.setItem("jade_hr_role", data.role);
    await loadMe();
    return data.role;
  };

  const logout = () => {
    localStorage.removeItem("jade_hr_token");
    localStorage.removeItem("jade_hr_role");
    setUser(null);
    setPermissions({});
    setPermissionsLoading(true);
  };

  // accounts always has full access; hr is gated per-key by what accounts has granted.
  const can = (...keys) => {
    if (!user) return false;
    if (user.role === "accounts") return true;
    if (user.role !== "hr") return false;
    return keys.some((k) => permissions[k]);
  };

  return (
    <AuthContext.Provider value={{ user, loading, permissionsLoading, login, logout, permissions, can, reloadPermissions: loadPermissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
