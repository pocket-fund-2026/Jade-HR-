export function formatINR(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

// All Jade locations are in India — force IST regardless of the viewer's
// own browser/OS timezone, so times display consistently for everyone.
const IST = "Asia/Kolkata";

export function formatDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: IST });
}

export function formatTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: IST });
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Pay periods run 23rd of the prior month - 22nd of the labeled month —
// mirrors backend/payroll.py's pay_period_bounds(), purely for display.
export function payPeriodLabel(year, month) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${SHORT_MONTHS[prevMonth - 1]} 23 – ${SHORT_MONTHS[month - 1]} 22, ${year}`;
}
