import { Link } from "react-router-dom";

import { REPORT_CATEGORIES } from "../../lib/reportsCatalog.js";
import { useAuth } from "../../lib/auth.jsx";

export default function Reports() {
  const { can } = useAuth();
  const visibleCategories = REPORT_CATEGORIES
    .map((cat) => ({ ...cat, items: cat.items.filter(({ permission }) => !permission || can(...[].concat(permission))) }))
    .filter((cat) => cat.items.length > 0);

  return (
    <div>
      <h2 className="font-display text-2xl text-ink mb-1">Reports</h2>
      <p className="text-sm text-ink/70 mb-6">Statutory and salary reports, computed from the same figures as the payslip.</p>

      <div className="space-y-8">
        {visibleCategories.map((cat) => (
          <div key={cat.title}>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/70 mb-3">{cat.title}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {cat.items.map(({ to, label, desc, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className="bg-paper rounded-sm shadow-card p-5 border-t-2 border-ink/10 hover:border-jade-500 transition-colors"
                >
                  <Icon size={20} className="text-jade-600 mb-3" />
                  <p className="font-display text-ink text-base">{label}</p>
                  <p className="text-xs text-ink/70 mt-1.5 leading-snug">{desc}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
