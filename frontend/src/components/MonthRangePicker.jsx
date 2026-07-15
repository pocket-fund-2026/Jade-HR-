const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthOptions(years) {
  const opts = [];
  for (const y of years) {
    for (let m = 1; m <= 12; m++) opts.push({ y, m });
  }
  return opts;
}

export default function MonthRangePicker({ fromYear, fromMonth, toYear, toMonth, onChange, years }) {
  const yearList = years || Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 4 + i);
  const options = monthOptions(yearList);

  const setFrom = (value) => {
    const [y, m] = value.split("-").map(Number);
    onChange(y, m, toYear, toMonth);
  };
  const setTo = (value) => {
    const [y, m] = value.split("-").map(Number);
    onChange(fromYear, fromMonth, y, m);
  };

  return (
    <div className="flex items-center gap-2 bg-paper rounded-sm shadow-card px-3 py-2">
      <span className="text-xs text-ink/70 font-medium">From</span>
      <select
        value={`${fromYear}-${fromMonth}`}
        onChange={(e) => setFrom(e.target.value)}
        className="rounded-sm border border-ink/15 bg-manila/40 px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
      >
        {options.map(({ y, m }) => (
          <option key={`${y}-${m}`} value={`${y}-${m}`}>{MONTHS[m - 1]} {y}</option>
        ))}
      </select>
      <span className="text-xs text-ink/70 font-medium">To</span>
      <select
        value={`${toYear}-${toMonth}`}
        onChange={(e) => setTo(e.target.value)}
        className="rounded-sm border border-ink/15 bg-manila/40 px-2 py-1.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
      >
        {options.map(({ y, m }) => (
          <option key={`${y}-${m}`} value={`${y}-${m}`}>{MONTHS[m - 1]} {y}</option>
        ))}
      </select>
    </div>
  );
}
