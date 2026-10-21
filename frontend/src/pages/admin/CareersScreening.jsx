import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import CareersNav from "../../components/CareersNav.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { VERDICT_LABEL } from "../../lib/careers.js";

// Lists are edited one entry per line. Entries are case-insensitive patterns, so
// plain words just work; \b marks a word edge (e.g. \bnift\b won't match "swift").
const SECTIONS = [
  {
    title: "Designer roles",
    blurb:
      "Applies to Design Studio roles whose title matches below. No portfolio = reject. Priority institute = strong fit. Accepted college = review. " +
      "Off-list college with the minimum years of experience = review. Everyone else is auto-rejected.",
    regex: [
      ["designer_title_regex", "Job titles this rule covers"],
      ["designer_title_exclude_regex", "Titles to skip"],
    ],
    number: ["senior_experience_years", "Minimum years of experience to rescue an off-list college"],
    lists: [
      ["priority_institutes", "Priority institutes (strong fit)"],
      ["accepted_fashion_institutes", "Accepted fashion colleges (review)"],
    ],
  },
  {
    title: "Retail & fashion consultant roles",
    blurb:
      "Applies to every Retail department role plus titles matching below. Needs atelier or haute couture experience in the resume or application. " +
      "A couture house or couture keyword = strong fit. Luxury brand without couture = review. Unreadable resume = review. Nothing = auto-rejected.",
    regex: [
      ["retail_title_regex", "Job titles this rule covers"],
      ["retail_title_exclude_regex", "Titles to skip"],
    ],
    lists: [
      ["couture_houses", "Couture houses & ateliers (strong fit)"],
      ["couture_keywords", "Atelier / couture keywords (strong fit)"],
      ["luxury_brands", "Luxury brands without couture (review)"],
      ["luxury_keywords", "Luxury keywords (review)"],
    ],
  },
];

const toText = (list) => (list || []).join("\n");
const toList = (text) => text.split("\n").map((s) => s.trim()).filter(Boolean);

export default function CareersScreening() {
  const [config, setConfig] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [running, setRunning] = useState(false);

  const load = () =>
    api.get("/api/careers/screening/config").then(({ data }) => {
      setConfig(data);
      const d = {};
      for (const s of SECTIONS) {
        for (const [k] of s.lists) d[k] = toText(data[k]);
        for (const [k] of s.regex) d[k] = data[k] || "";
        if (s.number) d[s.number[0]] = String(data[s.number[0]] ?? "");
      }
      setDraft(d);
    });

  useEffect(() => { load(); }, []);

  const dirty =
    config &&
    SECTIONS.some(
      (s) =>
        s.lists.some(([k]) => toText(toList(draft[k] || "")) !== toText(config[k])) ||
        s.regex.some(([k]) => (draft[k] || "") !== (config[k] || "")) ||
        (s.number && String(config[s.number[0]]) !== draft[s.number[0]])
    );

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const body = {};
    for (const s of SECTIONS) {
      for (const [k] of s.lists) body[k] = toList(draft[k] || "");
      for (const [k] of s.regex) body[k] = draft[k];
      if (s.number) body[s.number[0]] = Number(draft[s.number[0]]);
    }
    try {
      await api.put("/api/careers/screening/config", body);
      await load();
      setPreview(null);
      setMessage({ ok: true, text: "Saved. New applications use these rules immediately. Preview a re-screen to see how existing applicants would change." });
    } catch (e) {
      let text = "Could not save the rules.";
      try { text = JSON.parse(e.response?.data?.detail || "{}").error || text; } catch { /* keep default */ }
      setMessage({ ok: false, text });
    } finally {
      setSaving(false);
    }
  };

  const run = async (apply) => {
    if (apply && !confirm(`Apply re-screening to ${preview?.changes.length ?? "all"} changed applicants? Only New and Auto-Rejected statuses move; anyone already progressed keeps their status.`)) return;
    setRunning(true);
    setMessage(null);
    try {
      const { data } = await api.post("/api/careers/screening/run", { apply });
      setPreview(data);
      if (apply) setMessage({ ok: true, text: `Re-screened ${data.total} applicants; ${data.changes.length} changed.` });
    } catch {
      setMessage({ ok: false, text: "Re-screen failed. Please try again." });
    } finally {
      setRunning(false);
    }
  };

  const field = "w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-jade-500";

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl text-ink">Careers — Screening Rules</h2>
          <p className="text-xs text-ink/70 mt-0.5">Every new application is scored against these rules the moment it arrives. Auto-rejected candidates are kept and never emailed.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => run(false)}
            disabled={running || dirty}
            title={dirty ? "Save your changes first" : ""}
            className="px-4 py-2 rounded-sm text-sm font-semibold border border-ink/15 bg-paper text-ink hover:bg-manila/40 disabled:opacity-40"
          >
            {running ? "Checking…" : "Preview re-screen"}
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!dirty || saving}
            className="px-4 py-2 rounded-sm text-sm font-semibold bg-jade-600 text-white hover:bg-jade-700 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save rules"}
          </button>
        </div>
      </div>
      <CareersNav />

      {message && <p className={`text-sm mb-4 ${message.ok ? "text-jade-700" : "text-rust-500"}`}>{message.text}</p>}

      {preview && (
        <div className="bg-paper rounded-sm shadow-card p-6 mb-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/60">{preview.applied ? "Re-screen applied" : "Re-screen preview (nothing saved yet)"}</p>
              <p className="text-sm text-ink mt-1">
                {preview.total} applicants: {preview.tally.shortlist || 0} strong fit, {preview.tally.review || 0} review, {preview.tally.reject || 0} fail the brief.{" "}
                {preview.changes.length} would change.
              </p>
            </div>
            {!preview.applied && preview.changes.length > 0 && (
              <button
                type="button"
                onClick={() => run(true)}
                disabled={running}
                className="px-4 py-2 rounded-sm text-sm font-semibold bg-ink text-manila hover:bg-ink/90 disabled:opacity-40"
              >
                Apply to existing applicants
              </button>
            )}
          </div>
          {preview.changes.length > 0 && (
            <div className="overflow-x-auto mt-4 max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wider text-ink/60 sticky top-0 bg-paper">
                  <tr className="border-b border-ink/10">
                    <th className="py-2 pr-3 font-semibold">Applicant</th>
                    <th className="py-2 pr-3 font-semibold">Screening</th>
                    <th className="py-2 pr-3 font-semibold">Status</th>
                    <th className="py-2 font-semibold">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.map((c) => (
                    <tr key={c.id} className="border-b border-ink/[0.06] align-top">
                      <td className="py-2 pr-3">
                        <Link to={`/admin/careers/applicants/${c.id}`} className="font-medium text-ink hover:underline">{c.full_name}</Link>
                        <div className="text-[11px] text-ink/55">{c.job_title}</div>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-xs">
                        {VERDICT_LABEL[c.from_verdict] || "—"} → <StampBadge status={c.verdict}>{VERDICT_LABEL[c.verdict]}</StampBadge>
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-xs">{c.from_status === c.status ? <span className="text-ink/50">{c.status}</span> : `${c.from_status} → ${c.status}`}</td>
                      <td className="py-2 text-xs text-ink/65">{c.reasons}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {!config ? (
        <p className="text-ink/70 text-sm"><span className="t-shimmer" data-text="Loading…">Loading…</span></p>
      ) : (
        SECTIONS.map((s) => (
          <section key={s.title} className="bg-paper rounded-sm shadow-card p-6 mb-6">
            <h3 className="font-display text-lg text-ink">{s.title}</h3>
            <p className="text-xs text-ink/65 mt-1 max-w-3xl">{s.blurb}</p>
            <div className="grid md:grid-cols-2 gap-4 mt-5">
              {s.regex.map(([k, label]) => (
                <label key={k} className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/60">{label}</span>
                  <input value={draft[k] || ""} onChange={(e) => setDraft({ ...draft, [k]: e.target.value })} className={`${field} mt-1`} />
                  <span className="text-[11px] text-ink/50">Separate alternatives with |</span>
                </label>
              ))}
              {s.number && (
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/60">{s.number[1]}</span>
                  <input
                    type="number"
                    min="0"
                    max="40"
                    value={draft[s.number[0]] || ""}
                    onChange={(e) => setDraft({ ...draft, [s.number[0]]: e.target.value })}
                    className={`${field} mt-1 w-28`}
                  />
                </label>
              )}
            </div>
            <div className="grid md:grid-cols-2 gap-4 mt-5">
              {s.lists.map(([k, label]) => (
                <label key={k} className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-ink/60">
                    {label} <span className="font-nums text-ink/40 normal-case">({toList(draft[k] || "").length})</span>
                  </span>
                  <textarea
                    rows={10}
                    value={draft[k] || ""}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                    className={`${field} mt-1 leading-relaxed`}
                    spellCheck={false}
                  />
                  <span className="text-[11px] text-ink/50">One per line, case-insensitive</span>
                </label>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
