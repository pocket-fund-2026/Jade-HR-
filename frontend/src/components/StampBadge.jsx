const VARIANTS = {
  present: "text-jade-600",
  active: "text-jade-600",
  working: "text-jade-600",
  approved: "text-jade-600",
  absent: "text-rust-500",
  inactive: "text-rust-500",
  resigned: "text-rust-500",
  rejected: "text-rust-500",
  future: "text-ink/30",
  half_day: "text-ochre-500",
  ot: "text-ochre-500",
  pending: "text-ochre-500",
};

export default function StampBadge({ status, children }) {
  const tone = VARIANTS[status] || "text-ink/50";
  return <span className={`stamp ${tone}`}>{children ?? status}</span>;
}
