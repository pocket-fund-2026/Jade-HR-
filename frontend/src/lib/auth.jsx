import { createContext, useContext, useEffect, useState } from "react";

import api from "./api";

const AuthContext = createContext(null);
const CONSOLE_ROLES = ["accounts", "hr"];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);

  const loadPermissions = async () => {
    try {
      const { data } = await api.get("/api/permissions");
      setPermissions(Object.fromEntries(data.map((p) => [p.permission_key, p.hr_can_access])));
    } catch {
      setPermissions({});
    }
  };

  const loadMe = async () => {
    const token = localStorage.getItem("jade_hr_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/api/auth/me");
      setUser(data);
      // Don't block first render on this — nav items gated by a permission
      // just default to hidden for the instant it takes to arrive, then
      // pop in. Saves a full extra network round-trip before anything paints.
      if (CONSOLE_ROLES.includes(data.role)) loadPermissions();
    } catch {
      localStorage.removeItem("jade_hr_token");
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
  };

  // accounts always has full access; hr is gated per-key by what accounts has granted.
  const can = (...keys) => {
    if (!user) return false;
    if (user.role === "accounts") return true;
    if (user.role !== "hr") return false;
    return keys.some((k) => permissions[k]);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, permissions, can, reloadPermissions: loadPermissions }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
