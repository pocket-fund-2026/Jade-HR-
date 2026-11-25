// Sentence case for machine values shown to people (status codes, enum keys).
// "half_day" -> "Half day", "APPROVED" -> "Approved", "OT" and "WFH" stay as
// acronyms. Not for names or titles, where capitals are meaningful.
export function sentence(value) {
  if (value === null || value === undefined) return value;
  const s = String(value).replace(/[_-]+/g, " ").trim();
  if (!s) return s;
  const words = s.split(/\s+/).map((w, i) => {
    const acronym = w.length > 1 && w.length <= 4 && w === w.toUpperCase() && /[A-Z]/.test(w);
    return acronym ? w : w.toLowerCase();
  });
  const out = words.join(" ");
  return out.charAt(0).toUpperCase() + out.slice(1);
}
