// Mirrors backend/auth.py's require_hr_role / HR_TASKS_EXTRA_CODES — HR
// Tasks stays hidden from Accounts logins in general, except the shared
// "jadehr" department account, which was specifically asked to see every
// feature.
const HR_TASKS_EXTRA_CODES = new Set(["jadehr"]);

export function canSeeHrTasks(user) {
  if (!user) return false;
  return user.role === "hr" || HR_TASKS_EXTRA_CODES.has(user.employee_code);
}
