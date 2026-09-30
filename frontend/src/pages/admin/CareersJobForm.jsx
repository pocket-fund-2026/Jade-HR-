import { AlignLeft, Briefcase, ClipboardCheck, Eye, EyeOff, HelpCircle, MapPin, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import api from "../../lib/api.js";

const EMPTY = {
  title: "", department: "General", location: "Mumbai", employment_type: "Full-time",
  summary: "", description: "", responsibilities: "", requirements: "", assignment_brief: "",
  assignment_deadline_days: 5, is_active: true, sort_order: 0,
};

const FIELD = "w-full rounded-sm border border-ink/15 bg-manila/40 px-3 py-2.5 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-2 focus:ring-jade-500 focus:border-jade-500 transition-shadow";
const LABEL = "block text-xs font-semibold uppercase tracking-wider text-ink/60 mb-1.5";
const HINT = "text-[11px] text-ink/45 mt-1.5";

const QUESTION_TYPES = [
  { value: "short_text", label: "Short text answer" },
  { value: "long_text", label: "Long text answer" },
  { value: "file_pdf", label: "File upload (PDF)" },
];

function QuestionsEditor({ jobId }) {
  const [questions, setQuestions] = useState(null);
  const [draft, setDraft] = useState({ question_text: "", type: "short_text", required: true });
  const [saving, setSaving] = useState(false);

  const load = () => api.get(`/api/careers/jobs/${jobId}/questions`).then(({ data }) => setQuestions(data));

  useEffect(() => { load(); }, [jobId]);

  const addQuestion = async (e) => {
    e.preventDefault();
    if (!draft.question_text.trim()) return;
    setSaving(true);
    try {
      await api.post(`/api/careers/jobs/${jobId}/questions`, {
        ...draft,
        sort_order: questions?.length || 0,
      });
      setDraft({ question_text: "", type: "short_text", required: true });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleRequired = async (q) => {
    await api.put(`/api/careers/questions/${q.id}`, { ...q, required: !q.required });
    await load();
  };

  const removeQuestion = async (q) => {
    if (!window.confirm(`Remove "${q.question_text}"? Any answers already submitted for it stay on file.`)) return;
    await api.delete(`/api/careers/questions/${q.id}`);
    await load();
  };

  if (questions === null) return <p className="text-xs text-ink/50">Loading questions…</p>;

  return (
    <div className="space-y-4">
      {questions.length === 0 && (
        <p className="text-xs text-ink/50">No custom questions yet — applicants only see the standard fields.</p>
      )}
      {questions.map((q) => (
        <div key={q.id} className="flex items-start gap-3 rounded-sm border border-ink/10 bg-manila/25 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm text-ink font-medium">{q.question_text}</p>
            <p className="text-[11px] text-ink/50 mt-0.5">
              {QUESTION_TYPES.find((t) => t.value === q.type)?.label || q.type}
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] text-ink/60 flex-shrink-0 cursor-pointer">
            <input type="checkbox" checked={Boolean(q.required)} onChange={() => toggleRequired(q)} />
            Required
          </label>
          <button
            type="button"
            onClick={() => removeQuestion(q)}
            className="text-ink/40 hover:text-rust-500 flex-shrink-0"
            aria-label="Remove question"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}

      <form onSubmit={addQuestion} className="flex flex-col gap-2.5 rounded-sm border border-dashed border-ink/20 p-4">
        <input
          className={FIELD}
          placeholder="Question text, e.g. What's your notice period?"
          value={draft.question_text}
          onChange={(e) => setDraft((d) => ({ ...d, question_text: e.target.value }))}
        />
        <div className="flex flex-wrap items-center gap-3">
          <select
            className={`${FIELD} w-auto`}
            value={draft.type}
            onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
          >
            {QUESTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-ink/60 cursor-pointer">
            <input
              type="checkbox"
              checked={draft.required}
              onChange={(e) => setDraft((d) => ({ ...d, required: e.target.checked }))}
            />
            Required
          </label>
          <button
            type="submit"
            disabled={saving || !draft.question_text.trim()}
            className="ml-auto flex items-center gap-1.5 bg-jade-600 text-white px-3 py-2 rounded-sm text-xs font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors"
          >
            <Plus size={13} /> Add question
          </button>
        </div>
      </form>
    </div>
  );
}

function SectionCard({ icon: Icon, title, subtitle, children }) {
  return (
    <div className="bg-paper rounded-sm shadow-card overflow-hidden">
      <div className="px-6 py-4 border-b border-ink/[0.08] bg-manila/25 flex items-start gap-3">
        <div className="w-8 h-8 rounded-sm bg-jade-500/10 text-jade-600 flex items-center justify-center flex-shrink-0">
          <Icon size={16} />
        </div>
        <div>
          <h3 className="font-display text-base text-ink leading-tight">{title}</h3>
          {subtitle && <p className="text-xs text-ink/55 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="p-6 space-y-5">{children}</div>
    </div>
  );
}

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
    <div className="w-full pb-24">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/50 mb-1">
            {editing ? "Editing job posting" : "New job posting"}
          </p>
          <h2 className="font-display text-2xl text-ink">{form.title || "Untitled role"}</h2>
          {editing && form.slug && <p className="text-xs text-ink/45 font-nums mt-0.5">/careers/{form.slug}</p>}
        </div>
        <button
          type="button"
          onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-sm text-xs font-semibold border transition-colors flex-shrink-0 ${
            form.is_active
              ? "bg-jade-500/10 border-jade-500/30 text-jade-700"
              : "bg-rust-50 border-rust-500/30 text-rust-500"
          }`}
        >
          {form.is_active ? <Eye size={13} /> : <EyeOff size={13} />}
          {form.is_active ? "Live on careers site" : "Hidden from careers site"}
        </button>
      </div>

      <form onSubmit={save} className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-5 items-start">
        {/* Main column — the content candidates actually read */}
        <div className="space-y-5 min-w-0">
          <SectionCard icon={AlignLeft} title="Listing Content" subtitle="What candidates see on the job page">
            <div>
              <label className={LABEL}>Summary</label>
              <textarea className={FIELD} rows={2} value={form.summary} onChange={set("summary")} placeholder="One or two sentences shown on the jobs list" />
              <p className={HINT}>Shown on the careers listing page, above the fold.</p>
            </div>
            <div>
              <label className={LABEL}>Description</label>
              <textarea className={FIELD} rows={6} value={form.description} onChange={set("description")} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className={LABEL}>Responsibilities</label>
                <textarea className={FIELD} rows={8} value={form.responsibilities} onChange={set("responsibilities")} placeholder={"- One responsibility per line\n- Renders as plain text with line breaks preserved"} />
              </div>
              <div>
                <label className={LABEL}>Requirements</label>
                <textarea className={FIELD} rows={8} value={form.requirements} onChange={set("requirements")} placeholder={"- One requirement per line"} />
              </div>
            </div>
            <p className={HINT}>Plain text only — no markdown. Line breaks carry over as-is, so lead each bullet with "- ".</p>
          </SectionCard>

          <SectionCard icon={ClipboardCheck} title="Candidate Assignment" subtitle="The take-home brief applicants complete after applying">
            <div>
              <label className={LABEL}>Assignment Brief</label>
              <textarea className={FIELD} rows={8} value={form.assignment_brief} onChange={set("assignment_brief")} />
            </div>
            <div className="max-w-xs">
              <label className={LABEL}>Deadline to submit (days after applying)</label>
              <input type="number" min={1} className={FIELD} value={form.assignment_deadline_days} onChange={set("assignment_deadline_days")} />
            </div>
          </SectionCard>

          <SectionCard icon={HelpCircle} title="Application Questions" subtitle="Custom screening questions candidates answer on the Apply form, before the resume upload">
            {editing ? (
              <QuestionsEditor jobId={id} />
            ) : (
              <p className="text-xs text-ink/50">Save this job first, then come back here to add custom questions.</p>
            )}
          </SectionCard>
        </div>

        {/* Sidebar column — short metadata fields, sticky so they stay in view while scrolling the long content on the left */}
        <div className="space-y-5 lg:sticky lg:top-8">
          <SectionCard icon={Briefcase} title="Basics" subtitle="Title and where the role appears">
            <div>
              <label className={LABEL}>Job Title</label>
              <input className={FIELD} value={form.title} onChange={set("title")} placeholder="e.g. Design Associate" required />
            </div>
            <div>
              <label className={LABEL}>Department</label>
              <input className={FIELD} value={form.department} onChange={set("department")} />
            </div>
            <div>
              <label className={LABEL}><MapPin size={11} className="inline -mt-0.5 mr-1" />Location</label>
              <input className={FIELD} value={form.location} onChange={set("location")} />
            </div>
            <div>
              <label className={LABEL}>Employment Type</label>
              <input className={FIELD} value={form.employment_type} onChange={set("employment_type")} />
            </div>
          </SectionCard>

          <SectionCard icon={Eye} title="Publishing" subtitle="Visibility and ordering on the careers site">
            <div className="flex items-center justify-between rounded-sm border border-ink/10 bg-manila/25 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">Active</p>
                <p className="text-xs text-ink/55 mt-0.5">Inactive roles are hidden but keep their applicant history.</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={Boolean(form.is_active)}
                  onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                <div className="w-10 h-6 bg-ink/20 rounded-full peer peer-checked:bg-jade-600 transition-colors" />
                <div className="absolute left-1 top-1 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4" />
              </label>
            </div>
            <div>
              <label className={LABEL}>Order on careers page</label>
              <p className={HINT}>Arrange roles by dragging them on the Careers job list.</p>
            </div>
          </SectionCard>
        </div>
      </form>

      <div className="fixed bottom-0 left-0 right-0 md:left-60 bg-paper/95 backdrop-blur border-t border-ink/10 px-4 md:px-8 py-4 flex gap-3 z-20">
        <button
          type="submit"
          onClick={save}
          disabled={saving}
          className="bg-jade-600 text-white px-6 py-2.5 rounded-sm text-sm font-semibold hover:bg-jade-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving…" : editing ? "Save Changes" : "Create Job"}
        </button>
        <button
          type="button"
          onClick={() => navigate("/admin/careers")}
          className="bg-paper border border-ink/15 text-ink px-6 py-2.5 rounded-sm text-sm font-semibold hover:bg-manila/50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
