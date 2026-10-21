import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import CareersNav from "../../components/CareersNav.jsx";
import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { APPLICANT_STATUSES, VERDICT_LABEL, formatDateTime } from "../../lib/careers.js";

const COLUMN_TONE = {
  New: "border-ink/20",
  "Assignment Submitted": "border-ink/20",
  Shortlisted: "border-jade-400",
  Interviewing: "border-jade-500",
  Offered: "border-jade-600",
  Hired: "border-jade-700",
  Rejected: "border-rust-400",
  "Auto-Rejected": "border-rust-400",
};

// Kanban of applicants by status. Drag a card to another column to move it;
// the change is logged against your name in the applicant's history.
export default function CareersPipeline() {
  const [jobs, setJobs] = useState([]);
  const [jobId, setJobId] = useState("");
  const [showClosed, setShowClosed] = useState(false);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState(null);
  const [overCol, setOverCol] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/careers/jobs").then(({ data }) => setJobs(data));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = { include_auto_rejected: "1" };
    if (jobId) params.job_id = jobId;
    api.get("/api/careers/applications", { params }).then(({ data }) => setApplications(data)).finally(() => setLoading(false));
  }, [jobId]);

  const columns = showClosed ? APPLICANT_STATUSES : APPLICANT_STATUSES.filter((s) => s !== "Rejected" && s !== "Auto-Rejected");

  const move = async (id, status) => {
    const app = applications.find((a) => a.id === id);
    if (!app || app.status === status) return;
    const prev = applications;
    setApplications(applications.map((a) => (a.id === id ? { ...a, status } : a)));
    setError("");
    try {
      await api.patch(`/api/careers/applications/${id}`, { status });
    } catch {
      setApplications(prev);
      setError(`Could not move ${app.full_name}. Please try again.`);
    }
  };

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-2xl text-ink">Careers — Pipeline</h2>
        <p className="text-xs text-ink/70 mt-0.5">Drag a card to move the applicant to another stage. Candidates are not emailed.</p>
      </div>
      <CareersNav />

      <div className="flex gap-3 mb-4 items-center flex-wrap">
        <select
          value={jobId}
          onChange={(e) => setJobId(e.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500"
        >
          <option value="">All jobs</option>
          {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}{j.is_active ? "" : " (closed)"}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-ink/70">
          <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} className="accent-jade-600" />
          Show rejected and auto-rejected
        </label>
      </div>
      {error && <p className="text-sm text-rust-500 mb-3">{error}</p>}

      {loading ? (
        <p className="text-ink/70 text-sm"><span className="t-shimmer" data-text="Loading…">Loading…</span></p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {columns.map((col) => {
            const cards = applications.filter((a) => a.status === col);
            return (
              <div
                key={col}
                onDragOver={(e) => { e.preventDefault(); setOverCol(col); }}
                onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
                onDrop={(e) => { e.preventDefault(); setOverCol(null); if (dragId != null) move(dragId, col); setDragId(null); }}
                className={`flex-shrink-0 w-64 rounded-sm bg-manila/50 border-t-4 ${COLUMN_TONE[col]} ${overCol === col ? "ring-2 ring-jade-500" : ""}`}
              >
                <div className="px-3 py-2.5 flex justify-between items-baseline">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/70">{col}</p>
                  <span className="font-nums text-xs text-ink/50">{cards.length}</span>
                </div>
                <div className="px-2 pb-2 space-y-2 min-h-[120px] max-h-[70vh] overflow-y-auto">
                  {cards.map((a) => (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={() => setDragId(a.id)}
                      onDragEnd={() => setDragId(null)}
                      className={`bg-paper rounded-sm shadow-card p-3 cursor-grab active:cursor-grabbing ${dragId === a.id ? "opacity-50" : ""}`}
                    >
                      <Link to={`/admin/careers/applicants/${a.id}`} className="text-sm font-medium text-ink hover:underline">{a.full_name}</Link>
                      <p className="text-[11px] text-ink/60 mt-0.5">{a.job_title}</p>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {a.screen_verdict && <StampBadge status={a.screen_verdict}>{VERDICT_LABEL[a.screen_verdict]}</StampBadge>}
                        {a.avg_rating != null && <span className="text-[11px] font-nums text-jade-700">★ {a.avg_rating}</span>}
                      </div>
                      {a.next_interview_at && <p className="text-[11px] font-nums text-ink/60 mt-1.5">Interview {formatDateTime(a.next_interview_at)}</p>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
