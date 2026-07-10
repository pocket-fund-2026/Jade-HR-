export default function StatCard({ label, value, sub, accent }) {
  return (
    <div className="bg-paper rounded-sm shadow-card px-5 py-4 border-t-2 border-ink/10">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">{label}</p>
      <p className={`font-display text-[28px] leading-tight mt-1.5 ${accent || "text-ink"}`}>{value}</p>
      {sub && <p className="text-xs text-ink/70 mt-1 font-nums">{sub}</p>}
    </div>
  );
}
