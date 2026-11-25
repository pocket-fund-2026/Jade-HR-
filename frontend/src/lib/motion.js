// Document-level motion behaviours (no per-page wiring):
//  - nav direction: back/forward set data-nav so page slides come from the
//    side the user is travelling toward
//  - instant theme switch: transitions are suspended for a frame when the OS
//    theme flips, so colours change at once instead of cross-fading
//  - tooltip skip delay: once one tooltip has shown, neighbours appear
//    instantly until the pointer has been away for a moment
export function installMotion() {
  const root = document.documentElement;
  root.dataset.nav = "forward";
  window.addEventListener("popstate", () => { root.dataset.nav = "back"; });
  document.addEventListener("click", (e) => { if (e.target.closest("a[href], button")) root.dataset.nav = "forward"; }, true);

  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener?.("change", () => {
    root.classList.add("theme-switching");
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
  });

  let warm;
  const arm = () => { root.classList.add("tip-warm"); clearTimeout(warm); };
  const cool = () => { clearTimeout(warm); warm = setTimeout(() => root.classList.remove("tip-warm"), 400); };
  document.addEventListener("mouseover", (e) => { const t = e.target.closest?.("[data-tip]"); if (t && root.classList.contains("tip-warm")) arm(); }, true);
  document.addEventListener("mouseout", (e) => { if (e.target.closest?.("[data-tip]")) cool(); }, true);
  document.addEventListener("mouseover", (e) => { if (e.target.closest?.("[data-tip]")) setTimeout(() => { if (document.querySelector("[data-tip]:hover")) arm(); }, 360); }, true);
}
