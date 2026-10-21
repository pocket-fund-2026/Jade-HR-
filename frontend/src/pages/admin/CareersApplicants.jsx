import { Download, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import CareersNav from "../../components/CareersNav.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { APPLICANT_STATUSES, VERDICT_LABEL, downloadCsv, formatDateTime } from "../../lib/careers.js";
import { formatFullDate } from "../../lib/format.js";

const SELECT_CLS = "rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500";
const BULK_ACTIONS = [
  { status: "Shortlisted", label: "Shortlist" },
  { status: "Rejected", label: "Reject" },
  { status: "New", label: "Restore to New" },
];

export default function CareersApplicants() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const jobId = searchParams.get("job_id") || "";
  const status = searchParams.get("status") || "";
  const verdict = searchParams.get("verdict") || "";
  const search = searchParams.get("q") || "";
  // "active" hides applicants the screening rules auto-rejected; they're kept, just parked in their own tab.
  const view = searchParams.get("view") || "active";
  const [searchDraft, setSearchDraft] = useState(search);
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [bulkStatus, setBulkStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get("/api/careers/jobs").then(({ data }) => setJobs(data));
  }, []);

  const load = () => {
    setLoading(true);
    const params = {};
    if (jobId) params.job_id = jobId;
    if (status) params.status = status;
    else params.include_auto_rejected = "1";
    if (verdict) params.verdict = verdict;
    if (search) params.search = search;
    return api
      .get("/api/careers/applications", { params })
      .then(({ data }) => setApplications(data))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setSelected(new Set());
    load();
  }, [jobId, status, verdict, search]);

  // Debounce the search box into the URL.
  useEffect(() => {
    if (searchDraft === search) return undefined;
    const t = setTimeout(() => updateFilter("q", searchDraft.trim()), 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  const autoRejected = applications.filter((a) => a.status === "Auto-Rejected");
  const visible = useMemo(
    () => (status ? applications : view === "auto" ? autoRejected : applications.filter((a) => a.status !== "Auto-Rejected")),
    [applications, status, view]
  );

  function updateFilter(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: key === "q" });
  }

  const toggle = (id) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };
  const allChecked = visible.length > 0 && visible.every((a) => selected.has(a.id));
  const toggleAll = () => setSelected(allChecked ? new Set() : new Set(visible.map((a) => a.id)));

  const applyBulk = async (target) => {
    if (!target || !selected.size) return;
    if (!confirm(`Move ${selected.size} applicant${selected.size === 1 ? "" : "s"} to "${target}"? Candidates are not emailed.`)) return;
    setBusy(true);
    setMessage("");
    try {
      const { data } = await api.post("/api/careers/applications/bulk-status", { ids: [...selected], status: target });
      setMessage(`${data.changed} applicant${data.changed === 1 ? "" : "s"} moved to ${target}.`);
      setSelected(new Set());
      setBulkStatus("");
      await load();
    } catch {
      setMessage("Bulk update failed. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    const rows = (selected.size ? visible.filter((a) => selected.has(a.id)) : visible).map((a) => [
      a.full_name, a.email, a.phone, a.city, a.job_title, a.status, VERDICT_LABEL[a.screen_verdict] || "", a.screen_reasons,
      a.education, a.course, a.current_ctc, a.expected_ctc, a.willing_to_relocate, a.source, a.linkedin_url, a.portfolio_url,
      a.avg_rating ?? "", a.interview_count, a.created_at,
    ]);
    downloadCsv(`jade-applicants-${new Date().toISOString().slice(0, 10)}.csv`, [
      ["Name", "Email", "Phone", "City", "Job", "Status", "Screening", "Screening reason", "Education", "Course", "Current CTC",
        "Expected CTC", "Relocate to Bombay", "Source", "LinkedIn", "Portfolio", "Avg interview rating", "Interviews", "Applied (UTC)"],
      ...rows,
    ]);
  };

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl text-ink">Careers — Applicants</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">All applications submitted on the JADE Careers site</p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!visible.length}
          className="flex items-center gap-1.5 px-3 py-2 rounded-sm text-sm font-semibold border border-ink/15 bg-paper text-ink hover:bg-manila/40 disabled:opacity-40"
        >
          <Download size={14} /> Export CSV{selected.size ? ` (${selected.size})` : ""}
        </button>
      </div>
      <CareersNav />

      {!status && (
        <div className="flex gap-1 mb-4 border-b border-ink/10">
          {[
            ["active", "Active", applications.length - autoRejected.length],
            ["auto", "Auto-Rejected", autoRejected.length],
          ].map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              onClick={() => updateFilter("view", key === "active" ? "" : key)}
              className={`px-4 py-2 text-sm -mb-px border-b-2 transition-colors ${
                view === key ? "border-jade-600 text-ink font-semibold" : "border-transparent text-ink/60 hover:text-ink"
              }`}
            >
              {label} <span className="font-nums text-ink/50">({count})</span>
            </button>
          ))}
        </div>
      )}
      {!status && view === "auto" && (
        <p className="text-xs text-ink/60 mb-4">
          Screened out automatically (designers: institute/portfolio rule; retail and fashion consultants: no atelier or haute couture experience).
          Candidates are not notified. Select and restore anyone who deserves a look.
        </p>
      )}

      <div className="flex gap-3 mb-4 flex-wrap">
        <label className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
          <input
            type="search"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Name, email, phone, city, college"
            className={`${SELECT_CLS} pl-8 w-72`}
          />
        </label>
        <select value={jobId} onChange={(e) => updateFilter("job_id", e.target.value)} className={SELECT_CLS}>
          <option value="">All jobs</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.is_active ? "" : " (closed)"}</option>)}
        </select>
        <select value={status} onChange={(e) => updateFilter("status", e.target.value)} className={SELECT_CLS}>
          <option value="">All statuses</option>
          {APPLICANT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={verdict} onChange={(e) => updateFilter("verdict", e.target.value)} className={SELECT_CLS}>
          <option value="">Any screening result</option>
          {Object.entries(VERDICT_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-4 px-4 py-2.5 bg-ink text-manila rounded-sm text-sm">
          <span className="font-semibold mr-2">{selected.size} selected</span>
          {BULK_ACTIONS.map((b) => (
            <button
              key={b.status}
              type="button"
              disabled={busy}
              onClick={() => applyBulk(b.status)}
              className="px-3 py-1 rounded-sm border border-manila/30 hover:bg-manila/10 disabled:opacity-50"
            >
              {b.label}
            </button>
          ))}
          <select
            value={bulkStatus}
            disabled={busy}
            onChange={(e) => { setBulkStatus(e.target.value); applyBulk(e.target.value); }}
            className="rounded-sm bg-ink border border-manila/30 px-2 py-1 text-sm"
          >
            <option value="">Move to…</option>
            {APPLICANT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-manila/70 hover:text-manila text-xs">Clear</button>
        </div>
      )}
      {message && <p className="text-xs text-jade-700 mb-3">{message}</p>}

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left sticky top-0 z-10 bg-paper shadow-[0_1px_0_rgba(0,0,0,0.08)]">
            <tr className="border-b-2 border-ink/10">
              <th className="pl-5 pr-2 py-3 w-8">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" className="accent-jade-600" />
              </th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Applicant</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Job</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Contact</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Applied</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Screening</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Interviews</th>
              <th className="px-4 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={8}><span className="t-shimmer" data-text="Loading…">Loading…</span></td></tr>
            ) : visible.length === 0 ? (
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={8}>No applicants match these filters.</td></tr>
            ) : (
              visible.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => navigate(`/admin/careers/applicants/${a.id}`)}
                  className={`border-b border-ink/[0.06] last:border-0 cursor-pointer hover:bg-manila/30 transition-colors ${selected.has(a.id) ? "bg-jade-50/60" : ""}`}
                >
                  <td className="pl-5 pr-2 py-3.5" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggle(a.id)} aria-label={`Select ${a.full_name}`} className="accent-jade-600" />
                  </td>
                  <td className="px-4 py-3.5">
                    <Link
                      to={`/admin/careers/applicants/${a.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-ink font-medium underline decoration-ink/20 hover:decoration-ink"
                    >
                      {a.full_name}
                    </Link>
                    {a.education && <div className="text-[11px] text-ink/55 max-w-[14rem] truncate">{a.education}</div>}
                  </td>
                  <td className="px-4 py-3.5 text-ink/70">{a.job_title}</td>
                  <td className="px-4 py-3.5 text-ink/70 text-xs">
                    <div>{a.email}</div>
                    <div className="font-nums">{a.phone}</div>
                  </td>
                  <td className="px-4 py-3.5 font-nums text-ink/70 whitespace-nowrap">{formatFullDate(a.created_at)}</td>
                  <td className="px-4 py-3.5 max-w-xs">
                    {a.screen_verdict && <StampBadge status={a.screen_verdict}>{VERDICT_LABEL[a.screen_verdict] || a.screen_verdict}</StampBadge>}
                    {a.screen_reasons && <div className="text-[11px] text-ink/55 mt-1 leading-snug">{a.screen_reasons}</div>}
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ink/70 whitespace-nowrap">
                    {a.next_interview_at ? <div className="font-nums">Next: {formatDateTime(a.next_interview_at)}</div> : a.interview_count ? <div>{a.interview_count} held</div> : <span className="text-ink/35">—</span>}
                    {a.avg_rating != null && <div className="font-nums text-jade-700">★ {a.avg_rating}/5</div>}
                    {a.note_count > 0 && <div className="text-ink/50">{a.note_count} note{a.note_count === 1 ? "" : "s"}</div>}
                  </td>
                  <td className="px-4 py-3.5"><StampBadge status={a.status?.toLowerCase()}>{a.status}</StampBadge></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
