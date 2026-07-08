export default function LedgerLine({ label, value, sub, strong, accent }) {
  return (
    <div className={`flex justify-between items-baseline py-2 ${strong ? "" : "border-b border-ink/[0.06]"}`}>
      <div>
        <span className={strong ? "font-semibold text-ink" : "text-ink/70"}>{label}</span>
        {sub && <div className="text-xs text-ink/35 mt-0.5">{sub}</div>}
      </div>
      <span className={`font-nums ${strong ? `font-semibold text-lg ${accent || "text-ink"}` : "text-ink"}`}>
        {value}
      </span>
    </div>
  );
}
