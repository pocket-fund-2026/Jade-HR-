import { NavLink } from "react-router-dom";

const TABS = [
  { to: "/admin/careers/dashboard", label: "Dashboard" },
  { to: "/admin/careers/applicants", label: "Applicants" },
  { to: "/admin/careers/pipeline", label: "Pipeline" },
  { to: "/admin/careers", label: "Job Postings", end: true },
  { to: "/admin/careers/screening", label: "Screening Rules" },
];

// Section tabs shared by every Careers page in the admin console.
export default function CareersNav() {
  return (
    <nav className="flex gap-1 mb-6 border-b border-ink/10 overflow-x-auto" aria-label="Careers sections">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            `px-4 py-2 text-sm -mb-px border-b-2 whitespace-nowrap transition-colors ${
              isActive ? "border-jade-600 text-ink font-semibold" : "border-transparent text-ink/60 hover:text-ink"
            }`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
