import { payPeriodLabel } from "../lib/format.js";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function MonthPicker({ year, month, onChange }) {
  const shift = (delta) => {
    let m = month + delta;
    let y = year;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    onChange(y, m);
  };

  return (
    <div className="flex items-center gap-1 bg-paper rounded-sm shadow-card px-1 py-1">
      <button
        onClick={() => shift(-1)}
        className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-sm text-ink/70 hover:bg-ink/5 hover:text-ink transition-colors"
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="w-40 text-center leading-tight">
        <span className="block font-nums text-sm font-medium text-ink">
          {MONTHS[month - 1]} {year}
        </span>
        <span className="block font-nums text-[10px] text-ink/70">
          {payPeriodLabel(year, month)}
        </span>
      </span>
      <button
        onClick={() => shift(1)}
        className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-sm text-ink/70 hover:bg-ink/5 hover:text-ink transition-colors"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
