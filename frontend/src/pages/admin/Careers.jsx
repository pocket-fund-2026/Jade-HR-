import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import StampBadge from "../../components/StampBadge.jsx";
import api from "../../lib/api.js";

export default function Careers() {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api.get("/api/careers/jobs").then(({ data }) => setJobs(data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const remove = async (job) => {
    if (!confirm(`Delete "${job.title}"? This cannot be undone.`)) return;
    await api.delete(`/api/careers/jobs/${job.id}`);
    load();
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-display text-2xl text-ink">Careers — Job Postings</h2>
          <p className="text-xs text-ink/70 font-nums mt-0.5">Live on the JADE Careers site — jobs and applicants managed here</p>
        </div>
        <Link
          to="/admin/careers/new"
          className="flex items-center gap-1.5 bg-jade-600 text-white px-4 py-2 rounded-sm text-sm font-semibold hover:bg-jade-700 transition-colors"
        >
          <Plus size={15} /> New Job
        </Link>
      </div>

      <div className="bg-paper rounded-sm shadow-card overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left sticky top-0 z-10 bg-paper">
            <tr className="border-b-2 border-ink/10">
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Title</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Department</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Location</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Type</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Status</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Applicants</th>
              <th className="px-5 py-3 font-semibold text-[11px] uppercase tracking-wider text-ink/70">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={7}>Loading…</td></tr>
            ) : jobs.length === 0 ? (
              <tr><td className="px-5 py-8 text-ink/70 text-center" colSpan={7}>No job postings yet.</td></tr>
            ) : (
              jobs.map((job) => (
                <tr key={job.id} className="border-b border-ink/[0.06] last:border-0 align-top">
                  <td className="px-5 py-3.5 text-ink font-medium">{job.title}</td>
                  <td className="px-5 py-3.5 text-ink/70">{job.department}</td>
                  <td className="px-5 py-3.5 text-ink/70">{job.location}</td>
                  <td className="px-5 py-3.5 text-ink/70">{job.employment_type}</td>
                  <td className="px-5 py-3.5"><StampBadge status={job.is_active ? "active" : "inactive"}>{job.is_active ? "Active" : "Inactive"}</StampBadge></td>
                  <td className="px-5 py-3.5">
                    <Link to={`/admin/careers/applicants?job_id=${job.id}`} className="flex items-center gap-1 text-jade-600 underline font-nums text-xs">
                      <Users size={12} /> {job.applicant_count}
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex gap-2">
                      <Link
                        to={`/admin/careers/${job.id}/edit`}
                        className="flex items-center gap-1 bg-paper border border-ink/15 text-ink px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-manila/50 transition-colors"
                      >
                        <Pencil size={13} /> Edit
                      </Link>
                      <button
                        onClick={() => remove(job)}
                        className="flex items-center gap-1 bg-paper border border-rust-500 text-rust-500 px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-rust-50 transition-colors"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
