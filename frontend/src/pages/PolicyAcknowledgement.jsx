import { CheckCircle2, Circle, FileText, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../lib/auth.jsx";
import api from "../lib/api.js";
import { POLICY_TABS } from "./PolicyDocument.jsx";

// A document counts as read once its own scroll container has been scrolled to
// the bottom. Tolerance covers sub-pixel/zoom rounding, and a document shorter
// than its container (which can never scroll) is marked read as soon as it's
// opened — otherwise the button could never unlock on a large screen.
const SCROLL_TOLERANCE_PX = 24;

export default function PolicyAcknowledgement() {
  const { user, reloadPolicyAck } = useAuth();
  const [activeKey, setActiveKey] = useState(POLICY_TABS[0].key);
  const [readKeys, setReadKeys] = useState([]);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef(null);

  const markRead = (key) =>
    setReadKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));

  // Re-checked on open and on every scroll: a document that fits entirely
  // inside the pane has nothing to scroll, so it's read on sight.
  const checkScrolled = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_TOLERANCE_PX;
    if (atBottom) markRead(activeKey);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = 0;
    // Let the newly-switched document paint before measuring its height.
    const id = requestAnimationFrame(checkScrolled);
    return () => cancelAnimationFrame(id);
  }, [activeKey]);

  const allRead = POLICY_TABS.every((t) => readKeys.includes(t.key));
  const Active = useMemo(
    () => POLICY_TABS.find((t) => t.key === activeKey)?.render ?? POLICY_TABS[0].render,
    [activeKey],
  );

  const submit = async () => {
    setSubmitting(true);
    setError("");
    try {
      await api.post("/api/policy/acknowledgement", { documents_read: readKeys });
      // Flips the gate in AuthProvider, which lets the router through to the
      // console the user was originally headed for.
      await reloadPolicyAck();
    } catch (err) {
      setError(err.response?.data?.detail || "Could not record your acknowledgement — please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-manila flex flex-col">
      <header className="bg-ledger-800 text-manila px-5 sm:px-8 py-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-manila/80" />
            <h1 className="font-display text-xl sm:text-2xl">Company policy acknowledgement</h1>
          </div>
          <p className="text-sm text-manila/70 mt-1.5">
            {user?.name ? `${user.name}, before` : "Before"} you use the HR Console, please read each policy document
            below and confirm that you've read and understood it. This is recorded against your employee record.
          </p>
        </div>
      </header>

      <div className="flex-1 max-w-4xl w-full mx-auto px-5 sm:px-8 py-6 flex flex-col min-h-0">
        <div className="flex flex-wrap gap-2 mb-4">
          {POLICY_TABS.map((t) => {
            const isRead = readKeys.includes(t.key);
            return (
              <button
                key={t.key}
                onClick={() => setActiveKey(t.key)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-sm text-sm font-medium border transition-colors ${
                  activeKey === t.key
                    ? "bg-ledger-800 text-manila border-ledger-800"
                    : "bg-paper text-ink/70 border-ink/15 hover:border-ink/30"
                }`}
              >
                {isRead
                  ? <CheckCircle2 size={14} className={activeKey === t.key ? "text-manila" : "text-jade-600"} />
                  : <Circle size={14} className="opacity-50" />}
                {t.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-ink/60 mb-3 flex items-center gap-1.5">
          <FileText size={13} />
          {allRead
            ? "All documents read. Confirm below to continue."
            : `Scroll to the end of each document to mark it read — ${readKeys.length} of ${POLICY_TABS.length} done.`}
        </p>

        <div
          ref={scrollRef}
          onScroll={checkScrolled}
          className="flex-1 min-h-0 overflow-y-auto bg-manila/40 border border-ink/10 rounded-sm p-4 sm:p-5"
          style={{ maxHeight: "58vh" }}
        >
          <Active />
          <div className="mt-6 pt-4 border-t border-ink/10 text-xs text-ink/50 text-center">
            End of this document.
          </div>
        </div>

        <div className="bg-paper rounded-sm shadow-card p-5 mt-5">
          <label className="flex items-start gap-3 text-sm text-ink cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={!allRead}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded-sm border-ink/30 text-jade-600 focus:ring-jade-500 disabled:opacity-40"
            />
            <span className={allRead ? "" : "text-ink/50"}>
              I confirm that I have read and understood all {POLICY_TABS.length} policy documents above, including the
              late-arrival policy effective 22 September 2026, and I accept them.
            </span>
          </label>
          {error && <p className="text-sm text-rust-500 mt-3">{error}</p>}
          <button
            type="button"
            onClick={submit}
            disabled={!allRead || !confirmed || submitting}
            className="mt-4 w-full sm:w-auto flex items-center justify-center gap-1.5 bg-jade-600 text-white px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-40 transition-colors"
          >
            <ShieldCheck size={15} />
            {submitting ? "Recording…" : "Acknowledge and continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
