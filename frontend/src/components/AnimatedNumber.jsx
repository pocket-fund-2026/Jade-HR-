// "Number pop-in" (transitions.dev): each character re-enters with a small
// blurred rise, the last two staggered so decimals feel alive. Re-keys on the
// value, so it replays only when the number actually changes — not on every
// parent re-render. Non-primitive values (JSX) render untouched.
export default function AnimatedNumber({ value, className = "" }) {
  if (typeof value !== "string" && typeof value !== "number") return value ?? null;
  const str = String(value);
  if (str.length > 24) return str;
  const chars = Array.from(str);
  return (
    <span key={str} className={`t-digit-group ${className}`} aria-label={str}>
      {chars.map((ch, i) => (
        <span
          key={i}
          className="t-digit"
          aria-hidden="true"
          data-stagger={i === chars.length - 2 ? "1" : i === chars.length - 1 ? "2" : undefined}
        >
          {ch}
        </span>
      ))}
    </span>
  );
}
