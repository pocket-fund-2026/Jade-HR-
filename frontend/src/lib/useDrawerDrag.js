import { useEffect, useRef } from "react";
import { rubberBand, springTo } from "./spring.js";

// Swipe-to-close for the left off-canvas drawer. Dragging left follows the
// finger 1:1, dragging right rubber-bands, and release springs with the
// finger's velocity either closed or back open.
export function useDrawerDrag(onClose, active = true) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    let startX = 0, startY = 0, x = 0, vel = 0, lastX = 0, lastT = 0, drag = false, id = null, stop = () => {};
    const set = (v) => { x = v; el.style.transform = `translateX(${v}px)`; };
    const down = (e) => {
      if (e.target.closest("button, a, input")) return;
      stop(); drag = false; id = e.pointerId; startX = lastX = e.clientX; startY = e.clientY; lastT = e.timeStamp; vel = 0;
    };
    const move = (e) => {
      if (id !== e.pointerId) return;
      const dx = e.clientX - startX;
      if (!drag) {
        if (Math.abs(dx) < 8 || Math.abs(e.clientY - startY) > Math.abs(dx)) return;
        drag = true; el.setPointerCapture(id); el.style.animation = "none";
      }
      const dt = Math.max(e.timeStamp - lastT, 1);
      vel = ((e.clientX - lastX) / dt) * 1000;
      lastX = e.clientX; lastT = e.timeStamp;
      set(dx < 0 ? dx : rubberBand(dx, 80));
    };
    const up = (e) => {
      if (id !== e.pointerId || !drag) { id = null; return; }
      id = null; drag = false;
      const close = x + vel * 0.15 < -el.offsetWidth * 0.4;
      stop = springTo({
        from: x, to: close ? -el.offsetWidth : 0, velocity: vel,
        onUpdate: set, onDone: () => { if (close) onClose(); },
      });
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => { stop(); el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
  }, [onClose, active]);
  return ref;
}
