import { CheckCircle2, Circle, FileText, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../lib/auth.jsx";
import api from "../lib/api.js";
import { drawQuizQuestions, QUIZ_POLICY_VERSION } from "../lib/policyQuiz.js";
import { POLICY_TABS } from "./PolicyDocument.jsx";

function PolicyQuiz({ onPassed }) {
  const [questions, setQuestions] = useState(() => drawQuizQuestions());
  const [selected, setSelected] = useState({}); // question id -> option index
  const [result, setResult] = useState(null); // { score, total, passed }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const allAnswered = questions.every((q) => selected[q.id] !== undefined);

  const submit = async () => {
    setSubmitting(true);
    setError("");
    const answers = questions.map((q) => ({
      question_id: q.id,
      selected_index: selected[q.id],
      correct: selected[q.id] === q.correctIndex,
    }));
    const score = answers.filter((a) => a.correct).length;
    const total = questions.length;
    try {
      const { data } = await api.post("/api/policy/quiz/submit", {
        policy_version: QUIZ_POLICY_VERSION, score, total, answers,
      });
      // Grading (result set below) is shown on the questions themselves —
      // onPassed() only fires once the user clicks Continue, so a passing
      // score is never skipped past unseen.
      setResult({ score, total, passed: data.passed });
    } catch (err) {
      setError(err.response?.data?.detail || "Could not submit the quiz — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const retry = () => {
    setQuestions(drawQuizQuestions());
    setSelected({});
    setResult(null);
    setError("");
  };

  return (
    <div className="flex-1 max-w-4xl w-full mx-auto px-5 sm:px-8 py-6">
      <div className="bg-paper rounded-sm shadow-card p-5 sm:p-6 mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-jade-600 mb-1">Quick check</p>
        <h2 className="font-display text-xl text-ink mb-1">Policy comprehension quiz</h2>
        <p className="text-sm text-ink/70">
          A few questions from what you just read, to confirm it landed — not a trick quiz, just the actual numbers
          from the document above. You need {Math.ceil(questions.length * 0.8)} of {questions.length} correct to
          continue; you can retry with a fresh set of questions if you don't pass.
        </p>
      </div>

      {result && (
        <div
          className={`rounded-sm px-4 py-3 mb-5 text-sm text-ink border-l-2 ${
            result.passed ? "bg-jade-500/10 border-jade-600" : "bg-manila border-l-2 border-rust-500"
          }`}
        >
          {result.passed
            ? `You scored ${result.score} of ${result.total} — that's a pass. Correct/incorrect answers are marked below; click Continue when you're ready.`
            : `You scored ${result.score} of ${result.total} — not quite enough this time. Correct answers are marked below. Have another look at the policy above, then try again with a new set of questions.`}
        </div>
      )}

      <div className="space-y-4">
        {questions.map((q, i) => (
          <div key={q.id} className="bg-paper rounded-sm shadow-card p-5">
            <p className="text-sm font-medium text-ink mb-3">
              {i + 1}. {q.question}
              {result && (
                <span className={`ml-2 text-xs font-semibold uppercase tracking-wide ${selected[q.id] === q.correctIndex ? "text-jade-600" : "text-rust-500"}`}>
                  {selected[q.id] === q.correctIndex ? "Correct" : "Incorrect"}
                </span>
              )}
            </p>
            <div className="space-y-2">
              {q.options.map((opt, idx) => {
                const isSelected = selected[q.id] === idx;
                const isCorrectOption = idx === q.correctIndex;
                let cls = "border-ink/15 text-ink/80 hover:border-ink/30";
                if (result) {
                  if (isCorrectOption) cls = "border-jade-500 bg-jade-500/10 text-ink";
                  else if (isSelected) cls = "border-rust-500 bg-rust-500/10 text-ink";
                  else cls = "border-ink/10 text-ink/50";
                } else if (isSelected) {
                  cls = "border-jade-500 bg-jade-500/5 text-ink";
                }
                return (
                  <label
                    key={idx}
                    className={`flex items-center gap-2.5 text-sm rounded-sm border px-3 py-2 transition-colors ${result ? "cursor-default" : "cursor-pointer"} ${cls}`}
                  >
                    <input
                      type="radio"
                      name={q.id}
                      checked={isSelected}
                      disabled={!!result}
                      onChange={() => setSelected((s) => ({ ...s, [q.id]: idx }))}
                      className="h-4 w-4 text-jade-600 focus:ring-jade-500"
                    />
                    {opt}
                    {result && isCorrectOption && (
                      <CheckCircle2 size={14} className="text-jade-600 ml-auto" />
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-rust-500 mt-4">{error}</p>}

      <div className="mt-5">
        {result ? (
          result.passed ? (
            <button
              type="button"
              onClick={onPassed}
              className="flex items-center justify-center gap-1.5 bg-jade-600 text-white px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 transition-colors"
            >
              <ShieldCheck size={15} /> Continue to the console
            </button>
          ) : (
            <button
              type="button"
              onClick={retry}
              className="flex items-center justify-center gap-1.5 bg-jade-600 text-white px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 transition-colors"
            >
              Try again
            </button>
          )
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!allAnswered || submitting}
            className="flex items-center justify-center gap-1.5 bg-jade-600 text-white px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-40 transition-colors"
          >
            <ShieldCheck size={15} />
            {submitting ? "Checking…" : "Submit answers"}
          </button>
        )}
      </div>
    </div>
  );
}

// A document counts as read once its own scroll container has been scrolled to
// the bottom. Tolerance covers sub-pixel/zoom rounding, and a document shorter
// than its container (which can never scroll) is marked read as soon as it's
// opened — otherwise the button could never unlock on a large screen.
const SCROLL_TOLERANCE_PX = 24;

export default function PolicyAcknowledgement() {
  const { user, policyAck, reloadPolicyAck } = useAuth();
  // If the read-and-acknowledge row is already on file but the quiz hasn't
  // been passed yet (e.g. they closed the tab mid-quiz), skip straight back
  // to the quiz on return instead of making them re-read and re-confirm.
  const [stage, setStage] = useState(policyAck?.documents_read_recorded ? "quiz" : "read");
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
      // Not done yet — the comprehension quiz still has to be passed before
      // AuthProvider's gate actually opens (see routers/policy_ack.py's
      // my_acknowledgement, which now requires both).
      setStage("quiz");
    } catch (err) {
      setError(err.response?.data?.detail || "Could not record your acknowledgement — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-manila flex flex-col">
      <header className="bg-ledger-800 text-manila px-5 sm:px-8 py-5">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-2">
            <ShieldCheck size={20} className="text-manila/80" />
            <h1 className="font-display text-xl sm:text-2xl">
              {stage === "quiz" ? "Policy comprehension quiz" : "Company policy acknowledgement"}
            </h1>
          </div>
          <p className="text-sm text-manila/70 mt-1.5">
            {stage === "quiz"
              ? "One last step before the console unlocks."
              : `${user?.name ? `${user.name}, before` : "Before"} you use the HR Console, please read each policy document below and confirm that you've read and understood it. This is recorded against your employee record.`}
          </p>
        </div>
      </header>

      {stage === "quiz" ? (
        <PolicyQuiz onPassed={reloadPolicyAck} />
      ) : (
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

        <p className="text-xs text-ink/70 mb-3 flex items-center gap-1.5">
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
          <div className="mt-6 pt-4 border-t border-ink/10 text-xs text-ink/70 text-center">
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
            <span className={allRead ? "" : "text-ink/70"}>
              I confirm that I have read and understood all {POLICY_TABS.length} policy documents above, including the
              Attendance, Punctuality, Leave &amp; WFH Policy effective from the 23 Aug 2026 pay cycle, and I accept them.
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
      )}
    </div>
  );
}
