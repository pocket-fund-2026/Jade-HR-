// jade-careers' own public site — resumes/assignment files are served from
// its /uploads/ path (unauthenticated, same as the live public careers site
// itself). Update once careers.jadecouture.com's DNS is live.
export const CAREERS_SITE_URL = "https://jade-careers.vercel.app";

// Applicant statuses, in pipeline order. Auto-Rejected is set only by the screening rules.
export const APPLICANT_STATUSES = ["New", "Assignment Submitted", "Shortlisted", "Interviewing", "Offered", "Hired", "Rejected", "Auto-Rejected"];
export const VERDICT_LABEL = { shortlist: "Strong fit", review: "Review", reject: "Fails brief" };
export const INTERVIEW_STATUSES = ["Scheduled", "Completed", "Cancelled", "No-show"];
export const INTERVIEW_MODES = ["In person", "Video call", "Phone"];
export const RECOMMENDATIONS = ["Strong hire", "Hire", "Hold", "No hire"];

// jade-careers stores sqlite UTC ("YYYY-MM-DD HH:MM:SS") for system timestamps but
// interview times as the local datetime-local value the HR user typed.
export function utcToDate(s) {
  if (!s) return null;
  return new Date(s.includes("T") ? s : `${s.replace(" ", "T")}Z`);
}

export function formatDateTime(d) {
  if (!d) return "";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return String(d);
  return date.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

export function downloadCsv(filename, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
