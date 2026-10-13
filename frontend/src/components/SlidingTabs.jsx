import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

// "Tabs sliding" (transitions.dev): one ledger-green pill glides between the
// tab chips instead of each chip snapping colour. The pill is positioned with
// transform + width only, measured from the selected chip, so it also follows
// wrapped rows and re-measures when labels/counts change size.
export default function SlidingTabs({ tabs, value, onChange, className = "flex gap-1 mb-4" }) {
  const barRef = useRef(null);
  const pillRef = useRef(null);
  const mounted = useRef(false);

  const place = useCallback((animate) => {
    const bar = barRef.current;
    const pill = pillRef.current;
    if (!bar || !pill) return;
    const el = bar.querySelector('[aria-selected="true"]');
    if (!el) { pill.style.opacity = "0"; return; }
    if (!animate) pill.style.transition = "none";
    pill.style.opacity = "1";
    pill.style.width = `${el.offsetWidth}px`;
    pill.style.height = `${el.offsetHeight}px`;
    pill.style.transform = `translate(${el.offsetLeft}px, ${el.offsetTop}px)`;
    if (!animate) {
      void pill.offsetWidth;
      pill.style.transition = "";
    }
  }, []);

  useLayoutEffect(() => {
    place(mounted.current);
    mounted.current = true;
  }, [value, tabs, place]);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver(() => place(false));
    ro.observe(bar);
    [...bar.children].forEach((c) => { if (c !== pillRef.current) ro.observe(c); });
    return () => ro.disconnect();
  }, [tabs, place]);

  return (
    <div ref={barRef} className={`relative ${className}`} role="tablist">
      <span ref={pillRef} className="t-tabs-pill" aria-hidden="true" />
      {tabs.map((t) => {
        const selected = t.key === value;
        return (
          <button
            key={t.key || "all"}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(t.key)}
            className="px-4 py-2 rounded-sm text-sm font-medium bg-paper"
          >
            <span className={`t-tab-label ${selected ? "text-manila" : "text-ink/70"}`}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
