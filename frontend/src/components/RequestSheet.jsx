import { CheckCircle2, Paperclip, X } from "lucide-react";
import { useEffect } from "react";

import MidTruncate from "./MidTruncate.jsx";

// Shared shell for the employee request forms (leave, work absence, attendance
// dispute). Bottom sheet on phones, centred card on larger screens, with a
// sticky footer so the submit button is always in reach. `done` swaps the body
// for a confirmation screen so people can see the request actually went in.
export default function RequestSheet({
  icon: Icon, accent = "jade", eyebrow, title, onClose, children, footer, done,
}) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const tone = accent === "ochre"
    ? { bar: "border-ochre-500", chip: "bg-ochre-50 text-ochre-700" }
    : { bar: "border-jade-500", chip: "bg-jade-50 text-jade-700" };

  return (
    <div
      className="fixed inset-0 bg-ledger-900/60 z-50 flex items-end sm:items-center justify-center sm:px-4 sm:py-8"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog" aria-modal="true" aria-label={title}
        className={`bg-paper shadow-stamp w-full sm:max-w-lg rounded-t-sm sm:rounded-sm border-t-4 ${tone.bar} flex flex-col max-h-[92vh] sm:max-h-[88vh]`}
      >
        <div className="sm:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-ink/15" aria-hidden />
        <div className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-ink/[0.06]">
          {Icon && (
            <span className={`flex-shrink-0 rounded-sm p-2 ${tone.chip}`}><Icon size={18} /></span>
          )}
          <div className="flex-1 min-w-0">
            {eyebrow && <p className="text-[11px] font-semibold text-ink/60">{eyebrow}</p>}
            <p className="font-display text-lg text-ink leading-snug">{title}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1 -mr-1 text-ink/60 hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="px-6 py-10 text-center">
            <CheckCircle2 size={44} className="mx-auto text-jade-600 mb-3" />
            <p className="font-display text-xl text-ink mb-1.5">{done.title}</p>
            <p className="text-sm text-ink/70 max-w-sm mx-auto">{done.text}</p>
            <button
              onClick={done.onDone}
              className="mt-6 bg-ledger-800 text-manila px-8 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
            {footer && (
              <div className="border-t border-ink/[0.08] px-5 py-3 bg-paper rounded-b-sm pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export const inputCls =
  "w-full rounded-sm border border-ink/15 bg-manila/40 px-3.5 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500";

// Big tappable option card, used for "what kind of leave" / "what went wrong".
export function ChoiceCard({ selected, onClick, icon: Icon, title, hint, badge }) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={selected}
      className={`text-left w-full rounded-sm border px-3 py-2.5 transition-colors flex items-start gap-2.5 ${
        selected ? "border-jade-600 bg-jade-50 ring-1 ring-jade-600" : "border-ink/15 bg-paper hover:border-jade-500"
      }`}
    >
      {Icon && <Icon size={16} className={`mt-0.5 flex-shrink-0 ${selected ? "text-jade-700" : "text-ink/50"}`} />}
      <span className="flex-1 min-w-0">
        <span className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-ink">{title}</span>
          {badge != null && <span className="text-[11px] font-nums text-ink/60 whitespace-nowrap">{badge}</span>}
        </span>
        {hint && <span className="block text-[11px] text-ink/60 mt-0.5 leading-snug">{hint}</span>}
      </span>
    </button>
  );
}

// Small pill buttons for one-tap dates ("Today", "Yesterday", …).
export function QuickPick({ options, value, onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value} type="button" onClick={() => onPick(o.value)}
          className={`rounded-sm px-3 py-1.5 text-xs font-semibold border transition-colors ${
            value === o.value ? "bg-ledger-800 text-manila border-ledger-800" : "border-ink/15 text-ink/70 hover:border-jade-500 hover:text-ink"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionLabel({ children, htmlFor, optional, required }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink/75 mb-1.5">
      {children}
      {optional && <span className="font-normal text-ink/50"> (optional)</span>}
      {required && <span className="text-rust-500"> *</span>}
    </label>
  );
}

// Who the request is filed as, in one line, instead of four greyed-out boxes.
export function FilingAs({ person, extra }) {
  if (!person) return null;
  const name = `${person.first_name || ""} ${person.last_name || ""}`.trim();
  return (
    <p className="text-xs text-ink/60 mb-4">
      Filing as <span className="font-semibold text-ink/80">{name}</span>
      {person.employee_code && <span className="font-nums"> · {person.employee_code}</span>}
      {extra}
    </p>
  );
}

export function FilePick({ file, onChange, accept, placeholder }) {
  return (
    <label className="flex items-center gap-2 w-full rounded-sm border border-dashed border-ink/25 bg-manila/40 px-3 py-3 text-sm text-ink/70 cursor-pointer hover:bg-manila/70 transition-colors">
      <Paperclip size={15} className="flex-shrink-0" />
      <span className="min-w-0 flex-1">{file ? <MidTruncate text={file.name} tail={12} /> : placeholder}</span>
      <input type="file" accept={accept} className="hidden" onChange={(e) => onChange(e.target.files?.[0] || null)} />
      {file && (
        <button type="button" onClick={(e) => { e.preventDefault(); onChange(null); }} className="text-xs font-semibold text-rust-500 hover:underline">
          Remove
        </button>
      )}
    </label>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  return <p role="alert" className="text-sm text-rust-500 bg-rust-50 border border-rust-500/30 rounded-sm px-3 py-2 mt-4">{children}</p>;
}

export function SubmitRow({ onCancel, busy, label, disabled, form }) {
  return (
    <div className="flex items-center justify-end gap-3">
      <button type="button" onClick={onCancel} className="text-sm text-ink/70 hover:text-ink px-3 py-2">Cancel</button>
      <button
        type="submit" form={form} disabled={busy || disabled}
        className="flex-1 sm:flex-none bg-ledger-800 text-manila px-6 py-2.5 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
      >
        {busy ? "Sending…" : label}
      </button>
    </div>
  );
}

export const isoDate = (dt) =>
  `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

export function shiftDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function dayCount(start, end) {
  if (!start || !end) return 0;
  const days = Math.round((new Date(end) - new Date(start)) / 86400000) + 1;
  return days > 0 ? days : 0;
}
