import { AlertTriangle, CheckCircle2, Mail, RefreshCw, Send } from "lucide-react";
import { useEffect, useState } from "react";

import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { formatOrdinalDate } from "../../lib/format.js";

// Every "Tina at JADE HR" email attempt (backend/routers/email_log.py) —
// built so "the mails aren't reaching anyone" can be answered from the
// console: was it sent, skipped (nobody to send to), or rejected, and
// what Resend says happened to it after that.

const KIND_LABELS = {
  leave_submitted: "Leave request", leave_resolved: "Leave decision", new_joiner: "New joiner",
  late_digest: "Late digest", clocks_digest: "HR clocks digest", absence_submitted: "Work absence",
  absence_resolved: "Work absence decision", onboarding_submitted: "Onboarding form", loan_submitted: "Loan request",
  loan_resolved: "Loan decision", salary_hold: "Salary hold", exit_initiated: "Exit started", letter: "Letter",
  test: "Test email", general: "Other",
};

const STATUS_STYLES = {
  sent: "bg-jade-50 text-jade-700",
  failed: "bg-rust-50 text-rust-600",
  skipped: "bg-ochre-50 text-ochre-700",
};

const EVENT_STYLES = {
  delivered: "text-jade-700",
  opened: "text-jade-700",
  clicked: "text-jade-700",
  bounced: "text-rust-600",
  complained: "text-rust-600",
  delivery_delayed: "text-ochre-700",
};

const REASON_LABELS = {
  no_recipient: "No recipient",
  employee_has_no_email: "No email on the employee's record",
  not_configured: "Email sending not configured",
  empty_list: "Nothing to report",
};

const inputCls = "rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

function Stat({ label, value, tone }) {
  return (
    <div className="bg-paper rounded-sm shadow-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/60">{label}</p>
      <p className={`font-display text-2xl mt-1 ${tone || "text-ink"}`}>{value}</p>
    </div>
  );
}

function stamp(iso) {
  const d = new Date(iso);
  return `${formatOrdinalDate(iso)} ${d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`;
}

export default function EmailLog() {
  const { user } = useAuth();
  const [health, setHealth] = useState(null);
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ kind: "", status: "", q: "" });
  const [testTo, setTestTo] = useState(user?.email || "");
  const [testState, setTestState] = useState({ sending: false, msg: "", ok: false });
  const [checking, setChecking] = useState({});

  const loadRows = () => {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    api.get("/api/email-log", { params }).then(({ data }) => setRows(data)).catch(() => setRows([]));
  };

  useEffect(() => {
    api.get("/api/email-log/health").then(({ data }) => setHealth(data)).catch(() => setHealth(null));
  }, []);

  useEffect(() => {
    const t = setTimeout(loadRows, filters.q ? 300 : 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const sendTest = async () => {
    setTestState({ sending: true, msg: "", ok: false });
    try {
      await api.post("/api/email-log/test", { to: testTo });
      setTestState({ sending: false, msg: `Test email sent to ${testTo}. Check the inbox and the Spam folder.`, ok: true });
      loadRows();
    } catch (err) {
      setTestState({ sending: false, msg: err.response?.data?.detail || "Test email failed", ok: false });
    }
  };

  const checkDelivery = async (id) => {
    setChecking((c) => ({ ...c, [id]: true }));
    try {
      const { data } = await api.post(`/api/email-log/${id}/refresh`);
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...data } : r)));
    } catch (err) {
      setRows((rs) => rs.map((r) => (r.id === id ? { ...r, last_event: err.response?.data?.detail || "lookup failed" } : r)));
    } finally {
      setChecking((c) => ({ ...c, [id]: false }));
    }
  };

  const week = health?.last_7_days || {};

  return (
    <div>
      <h2 className="font-display text-2xl text-ink">Email Log</h2>
      <p className="text-sm text-ink/70 mt-1 mb-6">
        Every email sent as {health?.from || "Tina at JADE HR"}: who it went to, and whether it was delivered.
      </p>

      {health && !health.configured && (
        <div className="flex gap-2 items-start bg-rust-50 border-l-2 border-rust-500 p-3 mb-5 text-sm text-rust-600">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
          Email sending is not configured on the server (RESEND_API_KEY is missing), so no email can go out.
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <Stat label="Sent, last 7 days" value={week.sent ?? "—"} tone="text-jade-700" />
        <Stat label="Failed, last 7 days" value={week.failed ?? "—"} tone={week.failed ? "text-rust-600" : "text-ink"} />
        <Stat label="Skipped, last 7 days" value={week.skipped ?? "—"} tone={week.skipped ? "text-ochre-700" : "text-ink"} />
        <Stat label="Active staff with no email" value={health ? `${health.active_without_email} / ${health.active_employees}` : "—"} tone={health?.active_without_email ? "text-ochre-700" : "text-ink"} />
      </div>

      {health && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
          <div className="bg-paper rounded-sm shadow-card p-5 text-sm space-y-1.5">
            <p className="font-display text-lg text-ink mb-1">Where emails go</p>
            <p><span className="text-ink/60">HR notifications:</span> {health.hr_notify_email}</p>
            <p><span className="text-ink/60">Salary-hold alerts:</span> {health.salary_hold_notify_email} + HR</p>
            <p>
              <span className="text-ink/60">New-joiner emails:</span>{" "}
              {health.new_joiner_recipients.length
                ? health.new_joiner_recipients.join(", ")
                : <>{health.hr_notify_email} <span className="text-ochre-700">(no list set; pick recipients under Leave Policy → New Joiner Email)</span></>}
            </p>
            <p>
              <span className="text-ink/60">Leave requests:</span> the employee's leave approver and reporting manager, plus HR.{" "}
              {health.active_without_leave_approver > 0 && (
                <span className="text-ochre-700">{health.active_without_leave_approver} active staff have no leave approver, so only HR hears about their requests.</span>
              )}
            </p>
          </div>
          <div className="bg-paper rounded-sm shadow-card p-5">
            <p className="font-display text-lg text-ink mb-1">Send a test email</p>
            <p className="text-xs text-ink/60 mb-3">Confirms an inbox is receiving HR emails end to end.</p>
            <div className="flex gap-2">
              <input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="name@jadecouture.com" className={`${inputCls} flex-1`} type="email" />
              <button
                onClick={sendTest}
                disabled={testState.sending || !testTo.includes("@")}
                className="flex items-center gap-2 bg-ledger-800 text-manila px-4 py-2 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
              >
                <Send size={14} /> {testState.sending ? "Sending…" : "Send"}
              </button>
            </div>
            {testState.msg && (
              <p className={`text-sm mt-2 ${testState.ok ? "text-jade-700" : "text-rust-500"}`}>{testState.msg}</p>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-3">
        <select value={filters.kind} onChange={(e) => setFilters((f) => ({ ...f, kind: e.target.value }))} className={inputCls}>
          <option value="">All email types</option>
          {Object.entries(KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} className={inputCls}>
          <option value="">Any status</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </select>
        <input value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} placeholder="Search recipient or subject…" className={`${inputCls} flex-1 min-w-[200px]`} />
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
        {rows === null ? (
          <p className="p-5 text-sm text-ink/70">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <Mail size={22} className="mx-auto text-ink/30 mb-2" />
            <p className="text-sm text-ink/60">No emails logged yet. Logging started on 1st October 2026.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-ink/60 border-b border-ink/10">
                <th className="px-4 py-2.5 font-semibold">When</th>
                <th className="px-4 py-2.5 font-semibold">Type</th>
                <th className="px-4 py-2.5 font-semibold">To</th>
                <th className="px-4 py-2.5 font-semibold">Subject</th>
                <th className="px-4 py-2.5 font-semibold">Status</th>
                <th className="px-4 py-2.5 font-semibold">Delivery</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-ink/5 last:border-0 align-top">
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink/70 text-xs">{stamp(r.created_at)}</td>
                  <td className="px-4 py-2.5 whitespace-nowrap text-ink/80">{KIND_LABELS[r.kind] || r.kind}</td>
                  <td className="px-4 py-2.5 text-ink">
                    {r.to_email || <span className="text-ink/40">nobody</span>}
                    {r.cc?.length > 0 && <span className="block text-[11px] text-ink/50">cc {r.cc.join(", ")}</span>}
                  </td>
                  <td className="px-4 py-2.5 text-ink/80 max-w-[320px]">{r.subject}</td>
                  <td className="px-4 py-2.5">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-sm capitalize ${STATUS_STYLES[r.status] || ""}`}>{r.status}</span>
                    {r.error && <span className="block text-[11px] text-ink/60 mt-1 max-w-[220px] break-words">{REASON_LABELS[r.error] || r.error}</span>}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">
                    {r.provider_id ? (
                      <div className="flex items-center gap-2">
                        {r.last_event && (
                          <span className={`text-xs font-semibold capitalize ${EVENT_STYLES[r.last_event] || "text-ink/70"}`}>
                            {r.last_event === "delivered" && <CheckCircle2 size={12} className="inline mr-1" />}
                            {r.last_event.replace(/_/g, " ")}
                          </span>
                        )}
                        <button
                          onClick={() => checkDelivery(r.id)}
                          disabled={checking[r.id]}
                          className="inline-flex items-center gap-1 text-xs text-jade-700 hover:underline disabled:opacity-50"
                        >
                          <RefreshCw size={11} className={checking[r.id] ? "animate-spin" : ""} /> {r.last_event ? "Recheck" : "Check"}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-ink/40">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
