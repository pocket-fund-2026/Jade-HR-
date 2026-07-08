import { createContext, useContext, useEffect, useState } from "react";

import api from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    const token = localStorage.getItem("jade_hr_token");
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const { data } = await api.get("/api/auth/me");
      setUser(data);
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
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
