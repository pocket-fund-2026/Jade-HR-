// "Matrix dot loader" (transitions.dev), "scan" variant: a 4x4 grid of dots
// pulsing left-to-right. Delays are computed once, outside render.
const CYCLE = 1200;
const DOTS = Array.from({ length: 16 }, (_, i) => Math.round((i % 4) * (CYCLE / 10)));

export default function MatrixLoader({ className = "" }) {
  return (
    <div className={`t-matrix ${className}`} role="status" aria-label="Loading">
      {DOTS.map((d, i) => <i key={i} style={{ "--d": d }} />)}
    </div>
  );
}
