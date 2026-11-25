import { typo } from "../lib/typo.jsx";
import { Link } from "react-router-dom";

// An empty list always says what is missing, why that is fine or not, and the
// one thing to do next. `action` is { label, to } for a link or { label, onClick }.
export default function EmptyState({ title, children, action, icon: Icon }) {
  const cls =
    "bg-ledger-800 text-on-jade px-[1.5em] py-[0.625em] leading-tight rounded-sm text-sm font-semibold hover:bg-ledger-700 transition-colors";
  return (
    <div className="empty-state">
      {Icon && <Icon size={28} className="text-ink/40" aria-hidden="true" />}
      <p className="empty-title">{typo(title)}</p>
      {children && <p className="empty-body text-sm text-ink/70">{typo(children)}</p>}
      {action &&
        (action.to ? (
          <Link to={action.to} className={cls}>{action.label}</Link>
        ) : (
          <button type="button" onClick={action.onClick} className={cls}>{action.label}</button>
        ))}
    </div>
  );
}
