// True when the signer has an exit sign-off they have not been shown yet, so a
// newly assigned one pops up even mid-session (callers poll for it). Remembers
// what was shown in sessionStorage.
const KEY = "exitSignoffSeen";
export function hasUnseenSignoff(items) {
  let seen = [];
  try { seen = JSON.parse(sessionStorage.getItem(KEY) || "[]"); } catch { /* storage unavailable */ }
  const fresh = (items || []).filter((i) => !seen.includes(i.item_id));
  if (!fresh.length) return false;
  try { sessionStorage.setItem(KEY, JSON.stringify([...seen, ...fresh.map((i) => i.item_id)])); } catch { /* ignore */ }
  return true;
}
