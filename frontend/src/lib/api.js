import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "";

// Auth now rides an httpOnly session cookie set by the backend (not readable
// from JS, so an XSS payload can no longer exfiltrate it the way a
// localStorage token could) — withCredentials makes the browser attach it.
export const api = axios.create({ baseURL: BASE_URL, withCredentials: true });

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  },
);

export default api;
