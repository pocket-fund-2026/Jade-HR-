// "Icon swap" (transitions.dev): both icons stay mounted and cross-fade with
// a touch of blur + scale, so toggles (show/hide password, menu/close) morph
// rather than pop.
export default function IconSwap({ active, a, b, className = "" }) {
  return (
    <span className={`t-icon-swap ${className}`} data-state={active ? "b" : "a"} aria-hidden="true">
      <span className="t-icon" data-icon="a">{a}</span>
      <span className="t-icon" data-icon="b">{b}</span>
    </span>
  );
}
