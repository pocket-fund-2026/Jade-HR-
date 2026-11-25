// Right-aligns numeric table columns. A column counts as numeric when every
// non-empty body cell reads as a number, amount, percentage or duration, and
// its header is not an identifier (code, phone, id...). Runs once per table
// change, batched in a frame, so no page needs to opt in.
const NUM = /^[-+(]?\s*[₹$€£]?\s*\d[\d,]*(\.\d+)?\s*(%|₹|hrs?|h|d|days?|mins?|m)?\)?$/;
const ID_HEADER = /\b(id|code|no\.?|number|phone|mobile|pin|pincode|ifsc|uan|account|ref|aadhaar|pan)\b|#/i;

function process(table) {
  const head = table.tHead?.rows?.[table.tHead.rows.length - 1];
  const rows = [...(table.tBodies[0]?.rows || [])].slice(0, 200);
  if (!head || rows.length === 0) return;
  [...head.cells].forEach((th, i) => {
    if (th.colSpan > 1 || ID_HEADER.test(th.textContent)) return;
    let seen = 0;
    let rich = false;
    for (const r of rows) {
      const c = r.cells[i];
      if (!c || c.colSpan > 1) return;
      const t = c.textContent.trim();
      if (!t || t === "—" || t === "-") continue;
      if (!NUM.test(t)) return;
      seen++;
      if (/[,.₹%]/.test(t)) rich = true;
    }
    if (!seen || (!rich && seen < 2)) return;
    th.classList.add("num-col");
    rows.forEach((r) => r.cells[i]?.classList.add("num-col"));
  });
}

export function installNumericAlign() {
  let queued = false;
  const run = () => {
    queued = false;
    document.querySelectorAll("table").forEach(process);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true, characterData: true });
  schedule();
}
