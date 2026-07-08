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
        className="w-8 h-8 flex items-center justify-center rounded-sm text-ink/50 hover:bg-ink/5 hover:text-ink transition-colors"
        aria-label="Previous month"
      >
        ‹
      </button>
      <span className="font-nums text-sm font-medium w-32 text-center text-ink">
        {MONTHS[month - 1]} {year}
      </span>
      <button
        onClick={() => shift(1)}
        className="w-8 h-8 flex items-center justify-center rounded-sm text-ink/50 hover:bg-ink/5 hover:text-ink transition-colors"
        aria-label="Next month"
      >
        ›
      </button>
    </div>
  );
}
