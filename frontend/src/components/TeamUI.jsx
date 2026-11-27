import { Check, X } from "lucide-react";
import { NavLink, useLocation, useOutletContext } from "react-router-dom";

import PersonAvatar from "./PersonAvatar.jsx";

// Sub-menu shared by every team page. The same pages are mounted under both
// /employee and /admin, so links keep whichever prefix we're under.
export function TeamTabs() {
  const { pathname } = useLocation();
  const base = pathname.startsWith("/admin") ? "/admin" : "/employee";
  const ctx = useOutletContext() || {};
  const p = ctx.pendingTeam || {};
  const tabs = [
    { to: `${base}/my-team`, label: "Team" },
    { to: `${base}/team-leave`, label: "Leave", badge: p.leave },
    { to: `${base}/team-disputes`, label: "Disputes", badge: p.disputes },
    { to: `${base}/team-wfh`, label: "WFH" },
    { to: `${base}/team-market-visits`, label: "Market visits", badge: p.visits },
  ];
  return (
    <nav aria-label="Team" className="flex gap-1.5 overflow-x-auto nav-scroll -mx-4 px-4 sm:mx-0 sm:px-0 mb-5">
      {tabs.map((t) => (
        <NavLink
          key={t.to} to={t.to}
          className={({ isActive }) => `flex flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-[1.25em] py-[0.5em] leading-tight text-sm font-semibold border transition-colors ${
            isActive ? "bg-ledger-800 text-manila border-ledger-800" : "bg-paper text-ink/70 border-ink/15 hover:border-jade-500 hover:text-ink"
          }`}
        >
          {t.label}
          {t.badge > 0 && <span className="bg-ochre-500 text-ledger-900 text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center font-nums">{t.badge}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
      <div className="min-w-0">
        <h2 className="font-display text-2xl text-ink">{title}</h2>
        {subtitle && <p className="text-sm text-ink/65 mt-0.5 max-w-2xl">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

// One request = one card. Wraps on any width; nothing scrolls sideways.
export function ApprovalCard({ person, meta, title, children, aside, footer }) {
  const name = `${person?.first_name || ""} ${person?.last_name || ""}`.trim();
  return (
    <li className="bg-paper rounded-sm shadow-card p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {person && <PersonAvatar person={person} />}
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="text-sm font-semibold text-ink">
              {name || "—"}
              {person?.employee_code && <span className="ml-1.5 text-xs font-normal text-ink/55 font-nums">{person.employee_code}</span>}
            </p>
            {title && <p className="text-sm font-semibold text-ink font-nums">{title}</p>}
          </div>
          {meta && <p className="text-xs text-ink/60 mt-0.5 break-words">{meta}</p>}
          {children && <div className="mt-2.5 text-sm text-ink/80 break-words space-y-1.5">{children}</div>}
        </div>
        {aside}
      </div>
      {footer && <div className="mt-4 pt-3 border-t border-ink/[0.07]">{footer}</div>}
    </li>
  );
}

// Remark box + reject/approve, stacking on phones.
export function DecisionBar({ note, onNote, onReject, onApprove, busy, rejectLabel = "Reject", approveLabel = "Approve", noteRequired = true, notePlaceholder, extra }) {
  const blocked = noteRequired && note.trim().length < 5;
  return (
    <div className="flex flex-col md:flex-row md:items-center gap-2.5">
      {extra}
      <input
        value={note} onChange={(e) => onNote(e.target.value)}
        aria-label={noteRequired ? "Remark (required)" : "Note (optional)"}
        placeholder={notePlaceholder || (noteRequired ? "Remark — say why (required)" : "Note (optional)")}
        className="flex-1 min-w-0 rounded-sm border border-ink/15 bg-manila/40 px-3.5 py-2 min-h-[44px] text-sm focus:outline-none focus:ring-2 focus:ring-jade-500"
      />
      <div className="grid grid-cols-2 gap-2 md:flex md:flex-shrink-0">
        <button
          disabled={busy || blocked} onClick={onReject} title={blocked ? "Write a remark first" : undefined}
          className="flex items-center justify-center gap-1.5 min-h-[44px] bg-paper border border-rust-500 text-rust-500 px-4 rounded-sm text-sm font-semibold hover:bg-rust-50 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          <X size={14} /> {rejectLabel}
        </button>
        <button
          disabled={busy || blocked} onClick={onApprove} title={blocked ? "Write a remark first" : undefined}
          className="flex items-center justify-center gap-1.5 min-h-[44px] bg-jade-600 text-white px-4 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors whitespace-nowrap"
        >
          <Check size={14} /> {approveLabel}
        </button>
      </div>
    </div>
  );
}

export function CardList({ loading, empty, children }) {
  if (loading) return <p className="text-sm text-ink/60 py-8 text-center">Loading…</p>;
  const arr = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : [];
  if (!arr.length || (Array.isArray(children) && children.length === 0)) return <div className="bg-paper rounded-sm shadow-card">{empty}</div>;
  return <ul className="space-y-3">{children}</ul>;
}
