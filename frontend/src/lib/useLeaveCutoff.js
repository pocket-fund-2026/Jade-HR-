import { useEffect, useState } from "react";

import api from "./api.js";

// Leave applications close with the pay cycle (the 22nd). Returns the earliest
// date a person can still apply for themselves, plus days left to the next cutoff.
export default function useLeaveCutoff() {
  const [cutoff, setCutoff] = useState(null);
  useEffect(() => {
    api.get("/api/me/leave-cutoff").then(({ data }) => setCutoff(data)).catch(() => {});
  }, []);
  return cutoff;
}

export function cutoffHint(cutoff) {
  if (!cutoff) return "";
  const soon = cutoff.days_to_cutoff <= 4 ? ` The pay cycle closes in ${cutoff.days_to_cutoff} day${cutoff.days_to_cutoff === 1 ? "" : "s"}.` : "";
  return `You can apply for days from ${cutoff.earliest_date} onward; earlier days are in a closed pay cycle and only HR can add them.${soon}`;
}
