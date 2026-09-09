import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const EMPTY = {
  title: "", department: "General", location: "Mumbai", employment_type: "Full-time",
  summary: "", description: "", responsibilities: "", requirements: "", assignment_brief: "",
  assignment_deadline_days: 5, is_active: true, sort_order: 0,
};

const FIELD = "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jade-500";
const LABEL = "block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5";

import api from "../../lib/api.js";

export default function CareersJobForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const editing = Boolean(id);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api.get("/api/careers/jobs").then(({ data }) => {
      const job = data.find((j) => String(j.id) === id);
      if (job) setForm(job);
    }).finally(() => setLoading(false));
  }, [id, editing]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (editing) await api.put(`/api/careers/jobs/${id}`, form);
      else await api.post("/api/careers/jobs", form);
      navigate("/admin/careers");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-ink/70 text-sm">Loading…</p>;

  return (
    <div className="max-w-2xl">
      <h2 className="font-display text-2xl text-ink mb-6">{editing ? "Edit Job" : "New Job Posting"}</h2>
      <form onSubmit={save} className="bg-paper rounded-sm shadow-card p-6 space-y-5">
        <div>
          <label className={LABEL}>Title</label>
          <input className={FIELD} value={form.title} onChange={set("title")} required />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className={LABEL}>Department</label>
            <input className={FIELD} value={form.department} onChange={set("department")} />
          </div>
          <div>
            <label className={LABEL}>Location</label>
            <input className={FIELD} value={form.location} onChange={set("location")} />
          </div>
          <div>
            <label className={LABEL}>Employment Type</label>
            <input className={FIELD} value={form.employment_type} onChange={set("employment_type")} />
          </div>
        </div>
        <div>
          <label className={LABEL}>Summary</label>
          <textarea className={FIELD} rows={2} value={form.summary} onChange={set("summary")} />
        </div>
        <div>
          <label className={LABEL}>Description</label>
          <textarea className={FIELD} rows={4} value={form.description} onChange={set("description")} />
        </div>
        <div>
          <label className={LABEL}>Responsibilities</label>
          <textarea className={FIELD} rows={4} value={form.responsibilities} onChange={set("responsibilities")} />
        </div>
        <div>
          <label className={LABEL}>Requirements</label>
          <textarea className={FIELD} rows={4} value={form.requirements} onChange={set("requirements")} />
        </div>
        <div>
          <label className={LABEL}>Assignment Brief</label>
          <textarea className={FIELD} rows={4} value={form.assignment_brief} onChange={set("assignment_brief")} />
        </div>
        <div className="grid grid-cols-3 gap-4 items-end">
          <div>
            <label className={LABEL}>Assignment Deadline (days)</label>
            <input type="number" className={FIELD} value={form.assignment_deadline_days} onChange={set("assignment_deadline_days")} />
          </div>
          <div>
            <label className={LABEL}>Sort Order</label>
            <input type="number" className={FIELD} value={form.sort_order} onChange={set("sort_order")} />
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={Boolean(form.is_active)}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Active (visible on careers site)
          </label>
        </div>
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-jade-600 text-white px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving…" : editing ? "Save Changes" : "Create Job"}
          </button>
          <button
            type="button"
            onClick={() => navigate("/admin/careers")}
            className="bg-paper border border-ink/15 text-ink px-5 py-2.5 rounded-sm text-sm font-semibold hover:bg-manila/50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
