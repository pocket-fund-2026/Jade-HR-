import { Briefcase, Flag, Home, MapPin, Plane, Stamp, UserPlus, Users2, Wallet } from "lucide-react";

// One definition of every console notification type, shared by the
// sidebar-wide NotificationCenter (bell + pop-up toasts) and the
// Dashboard's "waiting for you" cards, so wording and links never drift.
// `key` matches the pending* lists polled in AdminLayout.
export const NOTIFICATION_TYPES = [
  { key: "leave", singular: "leave request", plural: "leave requests", to: "/admin/leave", cta: "Review leave", icon: Plane, tone: "jade" },
  { key: "disputes", singular: "attendance dispute", plural: "attendance disputes", to: "/admin/disputes", cta: "Review disputes", icon: Flag, tone: "rust" },
  { key: "payslipApprovals", singular: "payslip approval", plural: "payslip approvals", to: "/admin/payslip-approvals", cta: "Review payslips", icon: Stamp, tone: "ochre" },
  { key: "onboarding", singular: "onboarding submission", plural: "onboarding submissions", to: "/admin/onboarding", cta: "Review onboarding", icon: UserPlus, tone: "jade" },
  { key: "workAbsence", singular: "work absence report", plural: "work absence reports", to: "/admin/work-absence", cta: "Review work absence", icon: Briefcase, tone: "ochre" },
  { key: "wfh", singular: "WFH request", plural: "WFH requests", to: "/admin/wfh-requests", cta: "Review WFH", icon: Home, tone: "jade" },
  { key: "marketVisits", singular: "market visit", plural: "market visits", to: "/admin/market-visits", cta: "Review visits", icon: MapPin, tone: "jade" },
  { key: "loans", singular: "loan request", plural: "loan requests", to: "/admin/loans", cta: "Review loans", icon: Wallet, tone: "ochre" },
  { key: "newEmployees", singular: "new employee", plural: "new employees", to: "/admin/employees", cta: "Open employees and create ID", icon: UserPlus, tone: "ochre" },
  { key: "careers", singular: "job application", plural: "job applications", to: "/admin/careers/applicants?status=New", cta: "Review applicants", icon: Users2, tone: "jade" },
];

export const TONES = {
  jade: { chip: "bg-jade-50 text-jade-700", bar: "bg-jade-500", text: "text-jade-700" },
  rust: { chip: "bg-rust-50 text-rust-600", bar: "bg-rust-500", text: "text-rust-600" },
  ochre: { chip: "bg-ochre-50 text-ochre-700", bar: "bg-ochre-500", text: "text-ochre-700" },
};

export const SEEN_KEY = "jade_hr_admin_notif_seen_at";
export const SEEN_EVENT = "jade-hr:notifications-seen";

export function readSeenAt() {
  try {
    return localStorage.getItem(SEEN_KEY) || "1970-01-01";
  } catch {
    return "1970-01-01";
  }
}

export function markAllSeen() {
  const now = new Date().toISOString();
  try {
    localStorage.setItem(SEEN_KEY, now);
  } catch {
    /* private mode: still dismiss for this page view */
  }
  window.dispatchEvent(new CustomEvent(SEEN_EVENT, { detail: now }));
  return now;
}

export function itemTime(item) {
  return item.created_at || item.submitted_at || "";
}

export function itemWho(item) {
  const e = item.hr_employees || item.employee || {};
  const name = item.full_name || item.employee_name || item.name
    || `${e.first_name || item.first_name || ""} ${e.last_name || item.last_name || ""}`.trim();
  return name || "";
}

export function countLabel(type, n) {
  return `${n} ${n === 1 ? type.singular : type.plural}`;
}

