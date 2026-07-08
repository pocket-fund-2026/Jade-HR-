export function formatINR(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export function formatTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}
