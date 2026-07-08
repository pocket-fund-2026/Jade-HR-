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
    <div className="flex items-center gap-3">
      <button
        onClick={() => shift(-1)}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100"
      >
        ‹
      </button>
      <span className="text-sm font-medium w-36 text-center">
        {MONTHS[month - 1]} {year}
      </span>
      <button
        onClick={() => shift(1)}
        className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:bg-gray-100"
      >
        ›
      </button>
    </div>
  );
}
