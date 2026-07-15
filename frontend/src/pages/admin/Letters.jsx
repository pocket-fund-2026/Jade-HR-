import { ArrowLeft, FileText, Pencil, Plus, Printer, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import api from "../../lib/api.js";
import { useAuth } from "../../lib/auth.jsx";
import { formatOrdinalDate } from "../../lib/format.js";

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

function substitute(body, values) {
  return body.replace(TOKEN_RE, (_, key) => values[key] ?? "");
}

// Multi-line tokens get a textarea instead of a single-line input, and each
// non-blank line is wrapped into the given HTML structure before substitution.
const MULTILINE_TOKENS = {
  kras: "numbered",
  termination_reasons: "bullets",
  warning_body: "paragraphs",
};

function wrapMultiline(text, mode) {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "";
  if (mode === "numbered") return `<ol>${lines.map((l) => `<li>${l}</li>`).join("")}</ol>`;
  if (mode === "bullets") return `<ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
  return lines.map((l) => `<p>${l}</p>`).join("");
}

// Tokens auto-filled from an existing employee record — anything else on a
// template is left for HR to type in per letter, always editable afterward.
function autofillFromEmployee(employee, profile) {
  if (!employee) return {};
  return {
    employee_name: `${employee.first_name} ${employee.last_name || ""}`.trim(),
    employee_code: employee.employee_code,
    designation: employee.designation || "",
    department: employee.department || "",
    date_of_joining: formatOrdinalDate(employee.date_of_joining),
    email: employee.email || "",
    address: profile?.current_address || profile?.permanent_address || "",
  };
}

const WORK_LOCATION = "Jade Lifestyles India, Madhu Estate, 2nd Floor B wing, Pandurang Budhkar Marg, Lower Parel, Mumbai 400013.";

// Starting values for tokens no employee record can supply — every one of
// these stays editable in the form before the letter is generated.
function defaultsFor(letterType, todayLabel, signatoryName, employeeName) {
  const common = {
    company_name: "JADE Lifestyles India",
    signatory_name: signatoryName || "",
    signatory_title: "Head - HR",
    letter_date: todayLabel,
  };
  const kv = { ...common };
  if (letterType === "offer_internship") {
    kv.work_location = WORK_LOCATION;
    kv.work_hours = "Monday to Friday - 10:00 am to 6:30 pm; Saturday – 10:00 am to 3:00 pm.";
    kv.duration = "2 months";
  }
  if (letterType === "offer_employment") {
    kv.work_location = WORK_LOCATION;
    kv.work_hours = "10:00am to 07:00pm Monday to Saturday";
    kv.probation_days = "90";
    kv.leave_days = "24";
    kv.acceptance_days = "3";
    kv.kras = "";
  }
  if (letterType === "warning") {
    kv.warning_subject = "Formal Warning Regarding Work Performance and Conduct";
    kv.warning_body = "";
  }
  if (letterType === "termination") {
    kv.termination_reasons = "";
  }
  if (letterType === "relieving") {
    kv.conduct_remark = `We found ${employeeName || "them"} to be hardworking and sincere.`;
  }
  if (letterType === "review_form") {
    kv.review_period = "";
    kv.reviewer_title = "";
  }
  return kv;
}

const TOKEN_LABELS = {
  employee_name: "Employee name", employee_code: "Employee code", designation: "Designation",
  department: "Department", date_of_joining: "Date of joining", email: "Email", address: "Address",
  letter_date: "Letter date", signatory_name: "Signatory name", signatory_title: "Signatory title",
  company_name: "Company name", work_location: "Work location", work_hours: "Hours of work",
  internship_role: "Internship role", stipend: "Stipend", commencement_date: "Commencement date",
  duration: "Duration", joining_date: "Joining date", probation_days: "Probation (days)",
  kras: "Key Responsibility Areas (one per line)", basic_salary: "Basic Salary", hra: "HRA",
  conveyance: "Conveyance", other_allowance: "Other Allowance", total_ctc: "Total CTC",
  leave_days: "Paid leave days/year", acceptance_days: "Days to accept offer",
  offer_letter_date: "Offer letter date", termination_reasons: "Reasons (one per line)",
  start_date: "Start date", end_date: "End date", conduct_remark: "Conduct remark",
  warning_subject: "Subject", warning_body: "Details of the issue (one paragraph per line)",
  review_period: "Period of review", reviewer_title: "Reviewer title",
};

const OFFICE_ADDRESS = "101 Raheja Xion, Dr. Ambedkar Road, Byculla (East), Mumbai 400027, India";

function LetterPreview({ html, onPrint }) {
  return (
    <div className="bg-paper rounded-sm shadow-card p-8 print-area">
      <div className="flex justify-end no-print mb-4">
        <button
          onClick={onPrint}
          className="flex items-center gap-2 bg-ledger-800 text-manila px-3 py-1.5 rounded-sm text-xs font-semibold hover:bg-ledger-700 transition-colors"
        >
          <Printer size={14} /> Print / Save as PDF
        </button>
      </div>
      <div className="flex items-center gap-3 pb-5 mb-5 border-b-2 border-ink/10">
        <img src="/jade-logo.png" alt="" className="w-11 h-11 flex-shrink-0" />
        <div>
          <p className="font-display text-ink text-lg leading-none">JADE Lifestyles India</p>
          <p className="text-ink/70 text-xs mt-1.5 leading-snug">{OFFICE_ADDRESS}</p>
        </div>
      </div>
      <div className="letter-doc text-sm text-ink leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

const NEW_TEMPLATE_SCAFFOLD = `<p>Date: {{letter_date}}</p>
<p>To,<br>
{{employee_name}}</p>
<p>Dear <strong>{{employee_name}}</strong>,</p>
<p>[Letter body goes here.]</p>
<p>Sincerely,</p>
<p><strong>{{signatory_name}}</strong><br>
{{signatory_title}}<br>
{{company_name}}</p>
`;

function slugify(title) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "letter";
}

function TemplateEditor({ template, onClose, onSaved, onDeleted }) {
  const isNew = !template;
  const [letterType, setLetterType] = useState(template?.letter_type || "");
  const [typeEdited, setTypeEdited] = useState(false);
  const [title, setTitle] = useState(template?.title || "");
  const [body, setBody] = useState(template?.body || NEW_TEMPLATE_SCAFFOLD);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const tokens = useMemo(() => [...new Set([...body.matchAll(TOKEN_RE)].map((m) => m[1]))], [body]);

  const onTitleChange = (value) => {
    setTitle(value);
    if (isNew && !typeEdited) setLetterType(slugify(value));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (isNew) {
        const { data } = await api.post("/api/letters/templates", { letter_type: letterType, title, body });
        onSaved(data, true);
      } else {
        const { data } = await api.put(`/api/letters/templates/${template.letter_type}`, { title, body });
        onSaved(data, false);
      }
    } catch (err) {
      setError(err.response?.data?.detail || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Delete the "${template.title}" template? This can't be undone.`)) return;
    setDeleting(true);
    setError("");
    try {
      await api.delete(`/api/letters/templates/${template.letter_type}`);
      onDeleted(template.letter_type);
    } catch (err) {
      setError(err.response?.data?.detail || "Delete failed");
      setDeleting(false);
    }
  };

  return (
    <div>
      <button onClick={onClose} className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors mb-4">
        <ArrowLeft size={13} /> Back to Letters
      </button>
      <h2 className="font-display text-2xl text-ink mb-1">{isNew ? "New Letter Type" : "Edit Template"}</h2>
      <p className="text-sm text-ink/70 mb-5">
        Raw HTML — use <code className="font-nums">{"{{token_name}}"}</code> for anything that should be filled in per letter.
      </p>

      <div className="bg-paper rounded-sm shadow-card p-6 mb-4">
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Title</label>
        <input
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="e.g. Increment Letter"
          className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink mb-4 focus:outline-none focus:ring-2 focus:ring-jade-500"
        />
        {isNew && (
          <>
            <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Type key</label>
            <input
              value={letterType}
              onChange={(e) => { setTypeEdited(true); setLetterType(slugify(e.target.value)); }}
              className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink font-nums mb-4 focus:outline-none focus:ring-2 focus:ring-jade-500"
            />
          </>
        )}
        <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1.5">Body (HTML)</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={20}
          className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink font-nums focus:outline-none focus:ring-2 focus:ring-jade-500"
        />
        {tokens.length > 0 && (
          <p className="text-xs text-ink/60 mt-2">Tokens found: {tokens.join(", ")}</p>
        )}
        {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mt-3">{error}</p>}
        <div className="flex justify-between items-center mt-4">
          {!isNew ? (
            <button
              onClick={remove}
              disabled={deleting}
              className="text-xs text-rust-500 hover:underline disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete template"}
            </button>
          ) : <span />}
          <button
            onClick={save}
            disabled={saving || !title.trim() || (isNew && !letterType.trim())}
            className="flex items-center gap-2 bg-ledger-800 text-manila px-4 py-2 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
          >
            <Save size={15} /> {saving ? "Saving…" : isNew ? "Create Template" : "Save Template"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LetterGenerator({ template, canManage, onClose }) {
  const { user } = useAuth();
  const todayLabel = formatOrdinalDate(new Date().toISOString());
  const [mode, setMode] = useState("existing"); // existing | new
  const [employees, setEmployees] = useState([]);
  const [employeeId, setEmployeeId] = useState("");
  const [fieldValues, setFieldValues] = useState(() => defaultsFor(template.letter_type, todayLabel, user?.name));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState(null);

  useEffect(() => {
    // Every employee, active or not — Relieving/Termination letters are
    // almost always written for someone who has already been deactivated.
    api.get("/api/employees").then(({ data }) => {
      const sorted = [...data].sort((a, b) => {
        if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
        return `${a.first_name} ${a.last_name || ""}`.localeCompare(`${b.first_name} ${b.last_name || ""}`);
      });
      setEmployees(sorted);
    });
  }, []);

  const applyEmployee = async (id) => {
    setEmployeeId(id);
    if (!id) return;
    const [{ data: employee }, { data: profile }] = await Promise.all([
      api.get(`/api/employees/${id}`),
      api.get(`/api/employees/${id}/profile`),
    ]);
    setFieldValues((prev) => ({
      ...prev,
      ...defaultsFor(template.letter_type, todayLabel, user?.name, `${employee.first_name} ${employee.last_name || ""}`.trim()),
      ...autofillFromEmployee(employee, profile),
    }));
  };

  const setField = (key, value) => setFieldValues((prev) => ({ ...prev, [key]: value }));

  const renderedValues = useMemo(() => {
    const out = { ...fieldValues };
    for (const [key, mode2] of Object.entries(MULTILINE_TOKENS)) {
      if (out[key] != null) out[key] = wrapMultiline(out[key], mode2);
    }
    return out;
  }, [fieldValues]);

  const previewHtml = useMemo(() => substitute(template.body, renderedValues), [template.body, renderedValues]);

  const generateAndPrint = async () => {
    setSaving(true);
    setError("");
    try {
      const { data } = await api.post("/api/letters/generate", {
        letter_type: template.letter_type,
        employee_id: mode === "existing" ? (employeeId || null) : null,
        field_values: renderedValues,
      });
      setSavedId(data.id);
      setTimeout(() => window.print(), 100);
    } catch (err) {
      setError(err.response?.data?.detail || "Could not generate letter");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <button onClick={onClose} className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink transition-colors mb-4 no-print">
        <ArrowLeft size={13} /> Back to Letters
      </button>
      <h2 className="font-display text-2xl text-ink mb-5 no-print">Generate: {template.title}</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="no-print">
          <div className="bg-paper rounded-sm shadow-card p-5 mb-4">
            <div className="flex gap-4 mb-4 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} /> Existing employee
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} /> New / not yet in system
              </label>
            </div>
            {mode === "existing" && (
              <select
                value={employeeId}
                onChange={(e) => applyEmployee(e.target.value)}
                className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
              >
                <option value="">Select an employee…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.employee_code} — {e.first_name} {e.last_name}{!e.is_active ? " (Inactive)" : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="bg-paper rounded-sm shadow-card p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {template.tokens.map((token) => (
              <div key={token}>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70 mb-1">
                  {TOKEN_LABELS[token] || token}
                </label>
                {MULTILINE_TOKENS[token] ? (
                  <textarea
                    value={fieldValues[token] || ""}
                    onChange={(e) => setField(token, e.target.value)}
                    rows={4}
                    className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                  />
                ) : (
                  <input
                    value={fieldValues[token] || ""}
                    onChange={(e) => setField(token, e.target.value)}
                    className="w-full rounded-sm border border-ink/15 bg-paper px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-jade-500"
                  />
                )}
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-rust-500 border-l-2 border-rust-500 pl-2.5 py-0.5 mt-3">{error}</p>}
          {savedId && <p className="text-sm text-jade-600 mt-3">Saved to letter history.</p>}
          <div className="flex justify-end mt-4">
            <button
              onClick={generateAndPrint}
              disabled={saving}
              className="flex items-center gap-2 bg-ledger-800 text-manila px-4 py-2 rounded-sm text-sm font-semibold hover:bg-ledger-700 disabled:opacity-50 transition-colors"
            >
              <Printer size={15} /> {saving ? "Generating…" : "Generate & Print"}
            </button>
          </div>
        </div>

        <LetterPreview html={previewHtml} onPrint={() => window.print()} />
      </div>
    </div>
  );
}

export default function Letters() {
  const { can } = useAuth();
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("hub"); // hub | edit | new | generate
  const [activeType, setActiveType] = useState(null);

  const load = () => {
    setLoading(true);
    api.get("/api/letters/templates").then(({ data }) => setTemplates(data)).finally(() => setLoading(false));
  };

  useEffect(load, []);

  const active = templates.find((t) => t.letter_type === activeType);

  if (view === "new") {
    return (
      <TemplateEditor
        template={null}
        onClose={() => setView("hub")}
        onSaved={(created) => {
          setTemplates((ts) => [...ts, created].sort((a, b) => a.title.localeCompare(b.title)));
          setView("hub");
        }}
      />
    );
  }

  if (view === "edit" && active) {
    return (
      <TemplateEditor
        template={active}
        onClose={() => setView("hub")}
        onSaved={(updated) => {
          setTemplates((ts) => ts.map((t) => (t.letter_type === updated.letter_type ? { ...t, ...updated } : t)));
          setView("hub");
        }}
        onDeleted={(letterType) => {
          setTemplates((ts) => ts.filter((t) => t.letter_type !== letterType));
          setView("hub");
        }}
      />
    );
  }

  if (view === "generate" && active) {
    return <LetterGenerator template={active} canManage={can("letters.manage")} onClose={() => setView("hub")} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-1">
        <h2 className="font-display text-2xl text-ink">Letters</h2>
        {can("letters.manage") && (
          <button
            onClick={() => setView("new")}
            className="flex items-center gap-1.5 bg-ledger-800 text-manila px-3 py-2 rounded-sm text-xs font-semibold hover:bg-ledger-700 transition-colors"
          >
            <Plus size={14} /> New Letter Type
          </button>
        )}
      </div>
      <p className="text-sm text-ink/70 mb-6">Generate offer, confirmation, warning, and relieving letters — templates are editable, and you can design new ones.</p>

      {loading ? (
        <p className="text-ink/70">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <div key={t.letter_type} className="bg-paper rounded-sm shadow-card p-5 border-t-2 border-ink/10">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={18} className="text-jade-600" />
                <p className="font-display text-lg text-ink">{t.title}</p>
              </div>
              <div className="flex gap-2">
                {can("letters.generate") && (
                  <button
                    onClick={() => { setActiveType(t.letter_type); setView("generate"); }}
                    className="flex-1 bg-ledger-800 text-manila px-3 py-2 rounded-sm text-xs font-semibold hover:bg-ledger-700 transition-colors"
                  >
                    Generate
                  </button>
                )}
                {can("letters.manage") && (
                  <button
                    onClick={() => { setActiveType(t.letter_type); setView("edit"); }}
                    className="flex items-center gap-1.5 border border-ink/15 text-ink px-3 py-2 rounded-sm text-xs font-semibold hover:border-jade-500 transition-colors"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
