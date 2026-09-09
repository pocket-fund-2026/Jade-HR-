import { Check, FileText, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";
import { CAREERS_SITE_URL } from "../../lib/careers.js";
import { formatFullDate } from "../../lib/format.js";

const STATUS_OPTIONS = ["New", "Assignment Submitted", "Shortlisted", "Interviewing", "Offered", "Hired", "Rejected"];

function Field({ label, value }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">{label}</p>
      <p className="text-sm text-ink mt-0.5">{value}</p>
    </div>
  );
}

export default function CareersApplicantDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = () => api.get(`/api/careers/applications/${id}`).then(({ data }) => setData(data));

  useEffect(() => { load(); }, [id]);

  const setStatus = async (status) => {
    setSaving(true);
    try {
      await api.patch(`/api/careers/applications/${id}`, { status });
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <p className="text-ink/70 text-sm">Loading…</p>;
  const { application: a, job, submission } = data;

  const isAccepted = a.status === "Offered" || a.status === "Hired";
  const isRejected = a.status === "Rejected";

  return (
    <div className="max-w-3xl">
      <button onClick={() => navigate(-1)} className="text-xs text-ink/60 hover:text-ink mb-4">&larr; Back</button>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-2xl text-ink">{a.full_name}</h2>
            <StampBadge status={a.status?.toLowerCase()}>{a.status}</StampBadge>
          </div>
          <p className="text-sm text-ink/70 mt-0.5">Applied for {job?.title}</p>
        </div>
        <select
          value={a.status}
          disabled={saving}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-jade-500"
        >
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="bg-paper rounded-sm shadow-card p-6 mb-5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-1">Interview Decision</p>
        <p className="text-xs text-ink/55 mb-4">Accept to move the candidate to Offered, or reject to close out the application.</p>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => setStatus("Offered")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-sm text-sm font-semibold border transition-colors disabled:opacity-50 ${
              isAccepted
                ? "bg-jade-600 border-jade-600 text-white"
                : "bg-paper border-jade-500/40 text-jade-700 hover:bg-jade-500/10"
            }`}
          >
            <Check size={15} /> {isAccepted ? "Accepted" : "Accept"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setStatus("Rejected")}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-sm text-sm font-semibold border transition-colors disabled:opacity-50 ${
              isRejected
                ? "bg-rust-500 border-rust-500 text-white"
                : "bg-paper border-rust-500/40 text-rust-500 hover:bg-rust-50"
            }`}
          >
            <X size={15} /> {isRejected ? "Rejected" : "Reject"}
          </button>
        </div>
      </div>

      <div className="bg-paper rounded-sm shadow-card p-6 grid grid-cols-2 gap-5 mb-5">
        <Field label="Email" value={a.email} />
        <Field label="Phone" value={a.phone} />
        <Field label="City" value={a.city} />
        <Field label="Work Preference" value={a.work_preference} />
        <Field label="Education" value={a.education} />
        <Field label="Course" value={a.course} />
        <Field label="Study Stage" value={a.study_stage} />
        <Field label="Source" value={a.source} />
        <Field label="Applied On" value={formatFullDate(a.created_at)} />
        <Field label="Assignment Deadline" value={a.assignment_deadline_at ? formatFullDate(a.assignment_deadline_at) : null} />
        {a.linkedin_url && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">LinkedIn</p>
            <a href={a.linkedin_url} target="_blank" rel="noreferrer" className="text-sm text-jade-600 underline">{a.linkedin_url}</a>
          </div>
        )}
        {a.portfolio_url && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">Portfolio</p>
            <a href={a.portfolio_url} target="_blank" rel="noreferrer" className="text-sm text-jade-600 underline">{a.portfolio_url}</a>
          </div>
        )}
        {a.resume_path && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50">Resume</p>
            <a
              href={`${CAREERS_SITE_URL}/uploads/${a.resume_path}`}
              target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-sm text-jade-600 underline mt-0.5"
            >
              <FileText size={14} /> {a.resume_original_name || "Download resume"}
            </a>
          </div>
        )}
      </div>

      {a.about && (
        <div className="bg-paper rounded-sm shadow-card p-6 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">About</p>
          <p className="text-sm text-ink whitespace-pre-wrap">{a.about}</p>
        </div>
      )}

      {job?.assignment_brief && (
        <div className="bg-paper rounded-sm shadow-card p-6 mb-5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">Assignment Brief</p>
          <p className="text-sm text-ink whitespace-pre-wrap">{job.assignment_brief}</p>
        </div>
      )}

      <div className="bg-paper rounded-sm shadow-card p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink/50 mb-2">Assignment Submission</p>
        {!submission ? (
          <p className="text-sm text-ink/70">No submission yet.</p>
        ) : (
          <>
            {submission.text_answer && <p className="text-sm text-ink whitespace-pre-wrap mb-3">{submission.text_answer}</p>}
            <div className="flex flex-col gap-1.5">
              {submission.file_paths.map((f, i) => (
                <a
                  key={i}
                  href={`${CAREERS_SITE_URL}/uploads/${f.path}`}
                  target="_blank" rel="noreferrer"
                  className="flex items-center gap-1 text-sm text-jade-600 underline w-fit"
                >
                  <FileText size={14} /> {f.name}
                </a>
              ))}
            </div>
            <p className="text-xs text-ink/50 font-nums mt-3">Submitted {formatFullDate(submission.submitted_at)}</p>
          </>
        )}
      </div>
    </div>
  );
}
