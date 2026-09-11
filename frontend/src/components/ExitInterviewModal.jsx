import { X } from "lucide-react";
import { useState } from "react";

import api from "../lib/api.js";

const REASON_OPTIONS = [
  "Better opportunity", "Compensation", "Career growth", "Relocation", "Work environment",
  "Management/team issues", "Health/personal reasons", "Family reasons", "Retirement", "Other",
];
const YES_NO_MAYBE = ["Yes", "No", "Maybe"];

const inputCls =
  "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export default function ExitInterviewModal({ existing, onClose, onSubmitted }) {
  const [form, setForm] = useState(() => ({
    reasons_for_leaving: existing?.reasons_for_leaving || [],
    reason_other: existing?.reason_other || "",
    role_feedback: existing?.role_feedback || "",
    management_feedback: existing?.management_feedback || "",
    work_environment_feedback: existing?.work_environment_feedback || "",
    retention_insight: existing?.retention_insight || "",
    would_rejoin: existing?.would_rejoin || "",
    would_recommend: existing?.would_recommend || "",
    interviewee_signature: existing?.interviewee_signature || "",
    interviewer_signature: existing?.interviewer_signature || "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setField = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const toggleReason = (r) =>
    setField("reasons_for_leaving", form.reasons_for_leaving.includes(r)
      ? form.reasons_for_leaving.filter((x) => x !== r)
      : [...form.reasons_for_leaving, r]);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/api/me/exit-interview", form);
      onSubmitted();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not submit — try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50 overflow-y-auto py-8">
      <div className="bg-paper rounded-sm shadow-stamp w-full max-w-lg p-6 border-t-4 border-jade-500 relative my-auto">
        <button onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-ink/70 hover:text-ink transition-colors">
          <X size={18} />
        </button>
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">Before you go</p>
        <p className="font-display text-lg text-ink mb-1">Exit Interview</p>
        <p className="text-xs text-ink/70 mb-5">
          Your answers go to HR. Nothing here affects your final settlement — it's to help us understand what we
          could do better.
        </p>

        <form onSubmit={submit} className="space-y-5">
          <Field label="Reason(s) for leaving">
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {REASON_OPTIONS.map((r) => (
                <label key={r} className="flex items-center gap-1.5 text-sm text-ink cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.reasons_for_leaving.includes(r)}
                    onChange={() => toggleReason(r)}
                    className="rounded border-ink/30 text-jade-600 focus:ring-jade-500"
                  />
                  {r}
                </label>
              ))}
            </div>
            {form.reasons_for_leaving.includes("Other") && (
              <input
                className={`${inputCls} mt-2`}
                placeholder="Please specify"
                value={form.reason_other}
                onChange={(e) => setField("reason_other", e.target.value)}
              />
            )}
          </Field>

          {[
            ["role_feedback", "Your role & performance experience"],
            ["management_feedback", "Feedback on management & your team"],
            ["work_environment_feedback", "Work environment & the organisation"],
            ["retention_insight", "What could we have done to keep you?"],
          ].map(([key, label]) => (
            <Field key={key} label={label}>
              <textarea
                className={`${inputCls} min-h-[60px]`}
                value={form[key]}
                onChange={(e) => setField(key, e.target.value)}
              />
            </Field>
          ))}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Would you rejoin JADE?">
              <select className={inputCls} value={form.would_rejoin} onChange={(e) => setField("would_rejoin", e.target.value)}>
                <option value="">—</option>
                {YES_NO_MAYBE.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
            <Field label="Would you recommend JADE?">
              <select className={inputCls} value={form.would_recommend} onChange={(e) => setField("would_recommend", e.target.value)}>
                <option value="">—</option>
                {YES_NO_MAYBE.map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Your name (as signature)">
            <input
              className={inputCls}
              value={form.interviewee_signature}
              onChange={(e) => setField("interviewee_signature", e.target.value)}
            />
          </Field>

          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5">{error}</p>}

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-ink/70 hover:text-ink px-2">Cancel</button>
            <button
              type="submit"
              disabled={busy}
              className="bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
            >
              {busy ? "Submitting…" : existing ? "Update answers" : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
