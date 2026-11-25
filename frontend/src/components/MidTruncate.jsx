// Truncates in the middle so the part that identifies the value survives:
// "priyanka.sharma…@jadelifestyles.com", "Appointment-lett…final.pdf".
// The full text stays in the title tooltip and is selectable/copyable.
export default function MidTruncate({ text, tail = 10, className = "" }) {
  const s = String(text ?? "");
  if (s.length <= tail * 2) return <span className={className} title={s}>{s}</span>;
  const at = s.indexOf("@");
  const cut = at > 0 && s.length - at <= tail + 8 ? at : s.length - tail;
  return (
    <span className={`mid-trunc ${className}`} title={s}>
      <span className="mt-start">{s.slice(0, cut)}</span>
      <span className="mt-end">{s.slice(cut)}</span>
    </span>
  );
}
