import { CheckCircle2, ChevronDown, ChevronRight, GraduationCap, Mail, Plus, Search } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import api from "../../lib/api.js";
import { formatOrdinalDate } from "../../lib/format.js";

import EmptyState from "../../components/EmptyState.jsx";
// Internships: every internship letter issued, who it went to, every email that
// went out about it (the letter, the e-sign links, the signed copy) with its
// delivery status, and whether the intern has signed.
const STATUS = {
  none: { label: "Not sent for signing", cls: "text-ink/50" },
  awaiting_approval: { label: "Waiting for approver’s e-signature", cls: "text-ochre-600" },
  awaiting_candidate: { label: "Intern’s signature remaining", cls: "text-rust-500" },
  accepted: { label: "Signed by both", cls: "text-jade-700" },
  signed: { label: "Signed", cls: "text-jade-700" },
};
const FILTERS = [
  ["all", "All"], ["unsent", "Not emailed"], ["waiting", "Waiting on a signature"], ["signed", "Signed"], ["failed", "Email problems"],
];
const KIND = {
  letter: "Letter", offer_approval: "E-sign link to approver", offer_candidate: "Sign link to intern",
  offer_approved: "Approved notice to HR", offer_signed: "Signed copy", offer_approval_failed: "Link fallback to HR",
};
const stamp = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

export default function Internships() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState({});

  useEffect(() => {
    api.get("/api/letters/internships").then(({ data }) => setRows(data)).catch((e) => { setRows([]); setError(e.response?.data?.detail || "Could not load internship letters"); });
  }, []);

  const statusOf = (r) => STATUS[r.approval_status || "none"] || STATUS.none;
  const stats = useMemo(() => {
    const all = rows || [];
    return {
      total: all.length,
      emailed: all.filter((r) => r.emailed_at || r.mails_sent > 0).length,
      waiting: all.filter((r) => r.approval_status === "awaiting_approval" || r.approval_status === "awaiting_candidate").length,
      signed: all.filter((r) => r.approval_status === "accepted" || r.approval_status === "signed").length,
      failed: all.filter((r) => r.mails_failed > 0).length,
    };
  }, [rows]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (rows || []).filter((r) => {
      if (term && !`${r.intern_name} ${r.intern_email} ${r.role} ${r.department}`.toLowerCase().includes(term)) return false;
      if (filter === "unsent") return !r.emailed_at && r.mails_sent === 0;
      if (filter === "waiting") return r.approval_status === "awaiting_approval" || r.approval_status === "awaiting_candidate";
      if (filter === "signed") return r.approval_status === "accepted" || r.approval_status === "signed";
      if (filter === "failed") return r.mails_failed > 0;
      return true;
    });
  }, [rows, q, filter]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4 mb-1">
        <div className="flex items-center gap-2">
          <GraduationCap size={20} className="text-jade-600" />
          <h2 className="font-display text-2xl text-ink">Internships</h2>
        </div>
        <Link to="/admin/letters?type=offer_internship" className="inline-flex items-center gap-1.5 bg-jade-600 text-white px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold hover:bg-jade-700 transition-colors">
          <Plus size={13} /> New internship letter
        </Link>
      </div>
      <p className="text-sm text-ink/70 mb-5">Every internship letter and every email sent about it, with delivery and signature status.</p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-5">
        {[["Issued", stats.total], ["Emailed", stats.emailed], ["Waiting on a signature", stats.waiting], ["Signed", stats.signed], ["Email problems", stats.failed]].map(([label, n]) => (
          <div key={label} className="bg-paper rounded-sm shadow-card px-4 py-3">
            <p className="font-nums text-2xl text-ink">{n}</p>
            <p className="text-[11px] text-ink/60">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink/40" />
          <input aria-label="Search name, email, role" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, role…" className="pl-8 pr-3 py-2 rounded-sm border border-ink/15 bg-paper text-sm text-ink w-64 focus:outline-none focus:ring-2 focus:ring-jade-500" />
        </div>
        {FILTERS.map(([k, label]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-[1.5em] py-[0.625em] leading-tight rounded-sm text-xs font-semibold border ${filter === k ? "bg-ledger-800 text-manila border-ledger-800" : "bg-paper text-ink/70 border-ink/15 hover:text-ink"}`}>{label}</button>
        ))}
      </div>

      {error && <p className="text-sm text-rust-500 mb-3">{error}</p>}
      <div className="bg-paper rounded-sm shadow-card overflow-x-auto">
        {rows === null ? (
          <p className="p-5 text-sm text-ink/70">Loading…</p>
        ) : shown.length === 0 ? (
          rows.length ? <EmptyState title="No internship letters match" action={{ label: "Clear filters", onClick: () => { setQ(""); setFilter("all"); } }}>Try a different name or filter.</EmptyState> : <EmptyState title="No internship letters yet" action={{ label: "New internship letter", to: "/admin/letters?type=offer_internship" }}>Issued internship letters are tracked here.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-ink/60 border-b border-ink/10">
                <th className="px-4 py-2.5 w-6" />
                <th className="px-4 py-2.5 font-semibold">Intern</th>
                <th className="px-4 py-2.5 font-semibold">Role</th>
                <th className="px-4 py-2.5 font-semibold">Issued</th>
                <th className="px-4 py-2.5 font-semibold">Email</th>
                <th className="px-4 py-2.5 font-semibold">Signature</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = statusOf(r);
                const isOpen = !!open[r.id];
                return (
                  <Fragment key={r.id}>
                    <tr className="border-b border-ink/5 hover:bg-manila/40 align-top">
                      <td className="px-4 py-2.5">
                        <button onClick={() => setOpen((o) => ({ ...o, [r.id]: !isOpen }))} aria-label="Show emails" className="text-ink/50 hover:text-ink">
                          {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="text-ink font-semibold">{r.intern_name || "—"}</p>
                        <p className="text-xs text-ink/60">{r.intern_email || "no email on file"}</p>
                      </td>
                      <td className="px-4 py-2.5 text-ink">
                        {r.role || "—"}
                        <p className="text-xs text-ink/60">{[r.department, r.duration, r.stipend && `stipend ${r.stipend}`].filter(Boolean).join(" · ")}</p>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap text-ink/70">{formatOrdinalDate(r.created_at)}</td>
                      <td className="px-4 py-2.5">
                        {r.emailed_at ? (
                          <span className="inline-flex items-center gap-1 text-xs text-jade-700"><CheckCircle2 size={12} /> {r.emailed_to}<span className="text-ink/50 ml-1">{stamp(r.emailed_at)}</span></span>
                        ) : r.mails_sent > 0 ? (
                          <span className="text-xs text-jade-700">{r.mails_sent} email{r.mails_sent > 1 ? "s" : ""} sent</span>
                        ) : (
                          <span className="text-xs text-ink/50">Not emailed</span>
                        )}
                        {r.mails_failed > 0 && <p className="text-xs text-rust-500 font-semibold">{r.mails_failed} failed</p>}
                      </td>
                      <td className={`px-4 py-2.5 text-xs font-semibold ${st.cls}`}>{st.label}</td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <Link to={`/admin/letters?open=${r.id}`} className="text-xs font-semibold text-jade-700 hover:underline">Open</Link>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="bg-manila/30 border-b border-ink/5">
                        <td />
                        <td colSpan={6} className="px-4 py-3">
                          <p className="text-[11px] text-ink/60 mb-1.5 flex items-center gap-1"><Mail size={12} /> Emails about this letter</p>
                          {r.mails.length === 0 ? (
                            <p className="text-xs text-ink/60">Nothing has been emailed yet.</p>
                          ) : (
                            <ul className="space-y-1">
                              {r.mails.map((m, i) => (
                                <li key={i} className="text-xs text-ink flex flex-wrap gap-x-4">
                                  <span className="text-ink/60 w-28">{stamp(m.at)}</span>
                                  <span className="w-48">{KIND[m.kind] || m.kind}</span>
                                  <span className="text-ink/70">{m.to}</span>
                                  <span className={m.status === "sent" ? "text-jade-700 font-semibold" : m.status === "failed" ? "text-rust-500 font-semibold" : "text-ochre-600 font-semibold"}>
                                    {m.status}{m.delivery ? ` · ${m.delivery}` : ""}
                                  </span>
                                  {m.error && <span className="text-rust-500">{m.error}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
