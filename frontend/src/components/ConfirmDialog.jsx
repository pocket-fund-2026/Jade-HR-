import { createContext, useCallback, useContext, useRef, useState } from "react";

// A themed stand-in for window.confirm() — the native browser dialog was the
// one place in the console that broke the ledger/paper look with an
// unstyled OS popup. Same call shape as window.confirm (await a boolean),
// so call sites barely change: `if (!(await confirm("..."))) return;`.
const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null);
  const resolveRef = useRef(null);

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setState({ message, danger: !!opts.danger, confirmLabel: opts.confirmLabel || "Confirm" });
    });
  }, []);

  const settle = (value) => {
    resolveRef.current?.(value);
    resolveRef.current = null;
    setState(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <div
          className="fixed inset-0 bg-ledger-900/60 flex items-center justify-center px-4 z-50"
          role="alertdialog"
          aria-modal="true"
          onKeyDown={(e) => e.key === "Escape" && settle(false)}
        >
          <div
            className={`bg-paper rounded-sm shadow-stamp w-full max-w-sm p-6 border-t-4 rise-in ${
              state.danger ? "border-rust-500" : "border-jade-500"
            }`}
          >
            <p className="text-sm text-ink leading-relaxed mb-6">{state.message}</p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => settle(false)} className="text-sm text-ink/70 hover:text-ink px-2">
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => settle(true)}
                className={
                  state.danger
                    ? "bg-rust-500 text-white px-5 py-2.5 rounded-sm text-sm font-semibold hover:opacity-90 transition-opacity"
                    : "bg-ledger-800 text-manila px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
                }
              >
                {state.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm() must be called within a ConfirmProvider");
  return ctx;
}
