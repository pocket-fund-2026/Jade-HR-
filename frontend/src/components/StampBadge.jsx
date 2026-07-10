const VARIANTS = {
  present: "text-jade-600",
  active: "text-jade-600",
  working: "text-jade-600",
  approved: "text-jade-600",
  absent: "text-rust-500",
  inactive: "text-rust-500",
  resigned: "text-rust-500",
  rejected: "text-rust-500",
  future: "text-ink/65",
  half_day: "text-ochre-700",
  ot: "text-ochre-700",
  pending: "text-ochre-700",
  leave: "text-jade-600",
  weekoff: "text-ink/70",
};

export default function StampBadge({ status, children }) {
  const tone = VARIANTS[status] || "text-ink/70";
  return <span className={`stamp ${tone}`}>{children ?? status}</span>;
}
