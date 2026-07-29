// Plain from/to native date inputs — no existing date-range picker in the
// codebase to reuse (MonthPicker.jsx only steps a single calendar month).
export default function DateRangePicker({ from, to, onChange, onClear, disabled }) {
  return (
    <div className="flex items-center gap-2 bg-paper rounded-sm shadow-card px-2 py-1.5">
      <input
        type="date"
        value={from}
        max={to || undefined}
        onChange={(e) => onChange(e.target.value, to)}
        disabled={disabled}
        className="text-xs font-nums text-ink bg-transparent border border-ink/15 rounded-sm px-2 py-1 disabled:opacity-50"
      />
      <span className="text-ink/50 text-xs">to</span>
      <input
        type="date"
        value={to}
        min={from || undefined}
        onChange={(e) => onChange(from, e.target.value)}
        disabled={disabled}
        className="text-xs font-nums text-ink bg-transparent border border-ink/15 rounded-sm px-2 py-1 disabled:opacity-50"
      />
      {onClear && (
        <button
          onClick={onClear}
          disabled={disabled}
          className="text-xs text-ink/60 hover:text-ink underline disabled:opacity-50"
        >
          Clear
        </button>
      )}
    </div>
  );
}
