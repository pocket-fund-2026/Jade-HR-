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

export function formatFullDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: IST });
}

// Holiday list: shows the WEEKDAY alongside the date (e.g. "Mon, 08 Nov"). The
// weekday MUST be derived with timeZone: IST forced — a bare new Date("YYYY-MM-DD")
// parses as UTC midnight, so computing the weekday in the viewer's local zone
// (behind UTC) rolls back a day and prints the wrong weekday. Forcing IST here
// keeps it correct for every viewer.
export function formatHolidayDate(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", timeZone: IST });
}

const MONTH_NAMES_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// "5th May 2025" — matches the prose style JADE's letters are written in
// (as opposed to formatFullDate's "05 May 2025" tabular style).
export function formatOrdinalDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = d.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? "st"
    : day % 10 === 2 && day !== 12 ? "nd"
    : day % 10 === 3 && day !== 13 ? "rd"
    : "th";
  return `${day}${suffix} ${MONTH_NAMES_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatTime(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: IST });
}

// Attendance/payroll durations are stored as decimal hours (e.g. 6.5) —
// display as "6h 30m" everywhere a person reads them, never the raw decimal.
export function formatHoursMins(decimalHours) {
  const totalMinutes = Math.round((decimalHours || 0) * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}h ${m}m`;
}

const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// The pay-period (year, month) label currently in progress, by the same
// 23rd-rollover rule the backend uses (payroll.py _pay_period_label_for): on or
// after the 23rd we are already inside NEXT month's pay period. Payslip screens
// default to this instead of the raw calendar month, so a leave taken on/after
// the 23rd — which lands in the newly-started period — is visible rather than
// hidden on the just-closed month.
export function currentPayPeriod(now = new Date()) {
  let year = now.getFullYear();
  let month = now.getMonth() + 1; // 1-12
  if (now.getDate() >= 23) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return { year, month };
}

// Pay periods run 23rd of the prior month - 22nd of the labeled month —
// mirrors backend/payroll.py's pay_period_bounds(), purely for display.
export function payPeriodLabel(year, month) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  return `${SHORT_MONTHS[prevMonth - 1]} 23 – ${SHORT_MONTHS[month - 1]} 22, ${year}`;
}

// Days until the next occurrence of this date's month/day, ignoring the
// year (wraps to next year once this year's date has passed) — used for
// birthday countdowns on the Dashboard, Policy > Birthdays, and the
// birthday-today notification banner.
export function daysUntilAnnualDate(isoDate) {
  const [, month, day] = isoDate.split("-").map(Number);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let next = new Date(today.getFullYear(), month - 1, day);
  if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
  return Math.round((next - today) / 86400000);
}
