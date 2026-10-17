import axios from "axios";

const BASE_URL = import.meta.env.VITE_API_URL || "";

// Auth now rides an httpOnly session cookie set by the backend (not readable
// from JS, so an XSS payload can no longer exfiltrate it the way a
// localStorage token could) — withCredentials makes the browser attach it.
export const api = axios.create({ baseURL: BASE_URL, withCredentials: true });

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);
const MAX_RETRIES = 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    // Retry only idempotent GETs (and network drops) with jittered exponential
    // backoff, honouring Retry-After. Never POST/PUT/DELETE: the backend's
    // duplicate-submit guard covers user double-clicks, not blind client retries.
    const cfg = err.config;
    const status = err.response?.status;
    const retryable = cfg && cfg.method === "get" && (!err.response || RETRYABLE_STATUS.has(status));
    if (retryable) {
      cfg.__retryCount = (cfg.__retryCount || 0) + 1;
      if (cfg.__retryCount <= MAX_RETRIES) {
        const retryAfter = Number(err.response?.headers?.["retry-after"]);
        const backoff = Math.random() * 500 * 2 ** cfg.__retryCount;
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : backoff);
        return api(cfg);
      }
    }
    // skipAuthRedirect: for calls where a 401 is an expected, benign outcome
    // (e.g. AuthProvider's initial "am I logged in" probe on a public page
    // like /onboarding/new) — those shouldn't force-navigate a page that
    // never required a session in the first place. Protected routes still
    // redirect unauthenticated users to /login themselves (see App.jsx).
    if (err.response?.status === 401 && !err.config?.skipAuthRedirect) {
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  },
);

export default api;
