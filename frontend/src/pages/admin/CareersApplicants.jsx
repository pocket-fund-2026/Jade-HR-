import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { formatFullDate } from "../../lib/format.js";

const STATUS_OPTIONS = ["", "New", "Assignment Submitted", "Shortlisted", "Interviewing", "Offered", "Hired", "Rejected", "Auto-Rejected"];
const VERDICT_LABEL = { shortlist: "Strong fit", review: "Review", reject: "Fails brief" };

export default function CareersApplicants() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const jobId = searchParams.get("job_id") || "";
  const status = searchParams.get("status") || "";
  // "active" hides applicants the screening rules auto-rejected; they're kept, just parked in their own tab.
  const view = searchParams.get("view") || "active";
  const [jobs, setJobs] = useState([]);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/careers/jobs").then(({ data }) => setJobs(data));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (jobId) params.job_id = jobId;
    if (status) params.status = status;
    else params.include_auto_rejected = "1";
    api.get("/api/careers/applications", { params }).then(({ data }) => setApplications(data)).finally(() => setLoading(false));
  }, [jobId, status]);

  const autoRejected = applications.filter((a) => a.status === "Auto-Rejected");
  const visible = status ? applications : view === "auto" ? autoRejected : applications.filter((a) => a.status !== "Auto-Rejected");

  const updateFilter = (key, value) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-2xl text-ink">Careers — Applicants</h2>
        <p className="text-xs text-ink/70 font-nums mt-0.5">All applications submitted on the JADE Careers site</p>
      </div>

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
          Candidates are not notified. Open one and change the status to bring them back.
        </p>
      )}

      <div className="flex gap-3 mb-4">
        <select
          value={jobId}
          onChange={(e) => updateFilter("job_id", e.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500"
        >
          <option value="">All jobs</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
        </select>
        <select
          value={status}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.filter(Boolean).map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-left sticky top-0 z-10 bg-paper shadow-[0_1px_0_rgba(0,0,0,0.08)]">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Applicant</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Job</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Contact</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Applied</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Screening</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={6}><span className="t-shimmer" data-text="Loading…">Loading…</span></td></tr>
            ) : visible.length === 0 ? (
              <tr><td className="px-5 py-12 text-ink/70 text-center text-sm" colSpan={6}>No applicants match these filters.</td></tr>
            ) : (
              visible.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => navigate(`/admin/careers/applicants/${a.id}`)}
                  className="border-b border-ink/[0.06] last:border-0 cursor-pointer hover:bg-manila/30 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <Link
                      to={`/admin/careers/applicants/${a.id}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-ink font-medium underline decoration-ink/20 hover:decoration-ink"
                    >
                      {a.full_name}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5 text-ink/70">{a.job_title}</td>
                  <td className="px-5 py-3.5 text-ink/70 text-xs">
                    <div>{a.email}</div>
                    <div className="font-nums">{a.phone}</div>
                  </td>
                  <td className="px-5 py-3.5 font-nums text-ink/70">{formatFullDate(a.created_at)}</td>
                  <td className="px-5 py-3.5 max-w-xs">
                    {a.screen_verdict && <StampBadge status={a.screen_verdict}>{VERDICT_LABEL[a.screen_verdict] || a.screen_verdict}</StampBadge>}
                    {a.screen_reasons && <div className="text-[11px] text-ink/55 mt-1 leading-snug">{a.screen_reasons}</div>}
                  </td>
                  <td className="px-5 py-3.5"><StampBadge status={a.status?.toLowerCase()}>{a.status}</StampBadge></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
