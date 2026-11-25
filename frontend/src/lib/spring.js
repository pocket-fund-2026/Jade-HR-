// Velocity-preserving spring and rubber-band helpers.
// A release keeps the finger's speed: the spring starts at the current offset
// *and* the current velocity, so a fast flick carries on and a slow drag eases.
export function springTo({ from, to, velocity = 0, stiffness = 260, damping = 26, mass = 1, onUpdate, onDone }) {
  let x = from, v = velocity, last = performance.now(), raf;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce) { onUpdate(to); onDone?.(); return () => {}; }
  const step = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const a = (-stiffness * (x - to) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
    onUpdate(x);
    if (Math.abs(v) < 5 && Math.abs(x - to) < 0.4) { onUpdate(to); onDone?.(); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => cancelAnimationFrame(raf);
}

// Past the edge the surface still follows, but with growing resistance.
export function rubberBand(offset, limit = 160, k = 0.55) {
  const sign = Math.sign(offset), d = Math.abs(offset);
  return sign * (1 - 1 / ((d * k) / limit + 1)) * limit;
}
